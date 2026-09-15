# Parcial 1 Desarrollo Web - Backend Node.js

Backend web hecho con Node.js para gestionar usuarios, autenticacion, roles y peliculas.

## Requisitos cumplidos

- Crear usuarios con `username`, `password` y `role`.
- Guardar passwords con hash seguro usando `pbkdf2`.
- Autenticar usuarios con token firmado.
- Roles disponibles: `admin` y `basic`.
- Permitir que solo el usuario `admin` cree peliculas.
- Permitir que usuarios logueados consulten todas las peliculas.
- Permitir que usuarios logueados consulten peliculas filtradas por:
  - ano de lanzamiento mayor que un valor enviado por parametro.
  - precio menor o igual que un valor enviado por parametro.

## Ejecutar

```bash
npm start
```

El servidor queda disponible en:

```text
http://localhost:3000
```

Opcionalmente puede definir un secreto para los tokens:

```bash
JWT_SECRET=mi_secreto_seguro npm start
```

En PowerShell:

```powershell
$env:JWT_SECRET="mi_secreto_seguro"; npm start
```

## Endpoints

### Registrar usuario

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "username": "admin1",
  "password": "123456",
  "role": "admin"
}
```

Para usuario basico:

```json
{
  "username": "usuario1",
  "password": "123456",
  "role": "basic"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "username": "admin1",
  "password": "123456"
}
```

La respuesta incluye un `token`. Ese token se usa en rutas protegidas:

```http
Authorization: Bearer TOKEN_AQUI
```

### Crear pelicula

Solo puede hacerlo un usuario con rol `admin`.

```http
POST /api/movies
Content-Type: application/json
Authorization: Bearer TOKEN_AQUI
```

```json
{
  "title": "Interstellar",
  "director": "Christopher Nolan",
  "year": 2014,
  "productora": "Paramount Pictures",
  "price": 25000
}
```

### Consultar todas las peliculas

Puede hacerlo cualquier usuario logueado.

```http
GET /api/movies
Authorization: Bearer TOKEN_AQUI
```

### Filtrar peliculas

Puede hacerlo cualquier usuario logueado.

```http
GET /api/movies/filter?yearGreaterThan=2000&maxPrice=30000
Authorization: Bearer TOKEN_AQUI
```

## Pruebas rapidas con curl

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin1\",\"password\":\"123456\",\"role\":\"admin\"}"
```

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin1\",\"password\":\"123456\"}"
```

Copie el token recibido y uselo para crear una pelicula:

```bash
curl -X POST http://localhost:3000/api/movies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -d "{\"title\":\"Interstellar\",\"director\":\"Christopher Nolan\",\"year\":2014,\"productora\":\"Paramount Pictures\",\"price\":25000}"
```

## Integrantes

- Daniel Medina
