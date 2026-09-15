const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "cambia-este-secreto-en-produccion";
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MOVIES_FILE = path.join(DATA_DIR, "movies.json");
const VALID_ROLES = new Set(["admin", "basic"]);

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("El cuerpo de la peticion debe ser JSON valido.");
    error.statusCode = 400;
    throw error;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, storedHash] = storedPassword.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signToken(user) {
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlEncode({
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4
  });
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  const decodedPayload = base64UrlDecode(payload);
  if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;

  return decodedPayload;
}

function validateUserPayload(body) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const role = String(body.role || "basic").trim().toLowerCase();

  if (!username || username.length < 3) {
    return "El username es obligatorio y debe tener minimo 3 caracteres.";
  }

  if (!password || password.length < 6) {
    return "El password es obligatorio y debe tener minimo 6 caracteres.";
  }

  if (!VALID_ROLES.has(role)) {
    return "El rol debe ser admin o basic.";
  }

  return null;
}

function validateMoviePayload(body) {
  const title = String(body.title || "").trim();
  const director = String(body.director || "").trim();
  const year = Number(body.year);
  const productora = String(body.productora || "").trim();
  const price = Number(body.price);

  if (!title) return "El titulo es obligatorio.";
  if (!director) return "El director es obligatorio.";
  if (!Number.isInteger(year) || year < 1888) return "El ano de lanzamiento no es valido.";
  if (!productora) return "La productora es obligatoria.";
  if (!Number.isFinite(price) || price < 0) return "El precio no es valido.";

  return null;
}

async function authenticate(req) {
  const authorization = req.headers.authorization || "";
  const [type, token] = authorization.split(" ");

  if (type !== "Bearer" || !token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const users = await readJson(USERS_FILE, []);
  return users.find((user) => user.id === payload.sub) || null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

async function register(req, res) {
  const body = await readBody(req);
  const validationError = validateUserPayload(body);
  if (validationError) return jsonResponse(res, 400, { message: validationError });

  const users = await readJson(USERS_FILE, []);
  const username = String(body.username).trim();

  if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    return jsonResponse(res, 409, { message: "El username ya esta registrado." });
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    password: hashPassword(String(body.password)),
    role: String(body.role || "basic").trim().toLowerCase(),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  await writeJson(USERS_FILE, users);

  return jsonResponse(res, 201, {
    message: "Usuario creado correctamente.",
    user: publicUser(user)
  });
}

async function login(req, res) {
  const body = await readBody(req);
  const users = await readJson(USERS_FILE, []);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = users.find((item) => item.username.toLowerCase() === username.toLowerCase());

  if (!user || !verifyPassword(password, user.password)) {
    return jsonResponse(res, 401, { message: "Credenciales invalidas." });
  }

  return jsonResponse(res, 200, {
    message: "Autenticacion correcta.",
    token: signToken(user),
    user: publicUser(user)
  });
}

async function createMovie(req, res, currentUser) {
  if (currentUser.role !== "admin") {
    return jsonResponse(res, 403, { message: "Solo el administrador puede crear peliculas." });
  }

  const body = await readBody(req);
  const validationError = validateMoviePayload(body);
  if (validationError) return jsonResponse(res, 400, { message: validationError });

  const movies = await readJson(MOVIES_FILE, []);
  const movie = {
    id: crypto.randomUUID(),
    title: String(body.title).trim(),
    director: String(body.director).trim(),
    year: Number(body.year),
    productora: String(body.productora).trim(),
    price: Number(body.price),
    createdAt: new Date().toISOString(),
    createdBy: currentUser.id
  };

  movies.push(movie);
  await writeJson(MOVIES_FILE, movies);

  return jsonResponse(res, 201, {
    message: "Pelicula creada correctamente.",
    movie
  });
}

async function listMovies(_req, res) {
  const movies = await readJson(MOVIES_FILE, []);
  return jsonResponse(res, 200, { total: movies.length, movies });
}

async function filterMovies(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const yearGreaterThan = Number(url.searchParams.get("yearGreaterThan"));
  const maxPrice = Number(url.searchParams.get("maxPrice"));

  if (!Number.isInteger(yearGreaterThan) || !Number.isFinite(maxPrice)) {
    return jsonResponse(res, 400, {
      message: "Debe enviar yearGreaterThan como entero y maxPrice como numero."
    });
  }

  const movies = await readJson(MOVIES_FILE, []);
  const filteredMovies = movies.filter(
    (movie) => movie.year > yearGreaterThan && movie.price <= maxPrice
  );

  return jsonResponse(res, 200, {
    total: filteredMovies.length,
    movies: filteredMovies
  });
}

async function handleAuthenticatedRoute(req, res, routeHandler) {
  const currentUser = await authenticate(req);
  if (!currentUser) {
    return jsonResponse(res, 401, { message: "Debe iniciar sesion para acceder a este recurso." });
  }

  return routeHandler(req, res, currentUser);
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    return jsonResponse(res, 200, {
      message: "API Parcial Desarrollo Web",
      endpoints: [
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/movies",
        "GET /api/movies",
        "GET /api/movies/filter?yearGreaterThan=2000&maxPrice=30000"
      ]
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    return register(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    return login(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/movies") {
    return handleAuthenticatedRoute(req, res, createMovie);
  }

  if (req.method === "GET" && url.pathname === "/api/movies") {
    return handleAuthenticatedRoute(req, res, listMovies);
  }

  if (req.method === "GET" && url.pathname === "/api/movies/filter") {
    return handleAuthenticatedRoute(req, res, filterMovies);
  }

  return jsonResponse(res, 404, { message: "Ruta no encontrada." });
}

const server = http.createServer(async (req, res) => {
  try {
    await router(req, res);
  } catch (error) {
    console.error(error);
    jsonResponse(res, error.statusCode || 500, {
      message: error.message || "Error interno del servidor."
    });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor ejecutandose en http://localhost:${PORT}`);
});
