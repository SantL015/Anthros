# Anthros

## Ejecutar en local

Desde la raíz del proyecto, con Node.js 20 o superior:

```bash
npm install
npm start
```

Para usar variables locales, copia `.env.example` a `.env` y completa `MONGO_URI` y `GROQ_API_KEY`. Abre `http://localhost:3000`; para desarrollo usa `npm run dev` y para validar sintaxis y pruebas ejecuta `npm test`.

El seed es opcional y requiere `MONGO_URI`:

```bash
npm run seed
```

El servidor Express entrega las páginas de `front/` y conecta el checkout con estas rutas:

Para una vista rápida sin backend, también puedes abrir `front/index.html` directamente: las imágenes, los estilos, el menú y el catálogo de muestra funcionan en ese modo. Las funciones que requieren la API están disponibles al iniciar el servidor.

- `GET /api/health`
- `GET /api/products` con `q` o `field`/`value`, `limit` y `offset`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT` o `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/chat`
- `POST /api/accounts/register`
- `POST /api/contact`
- `GET /api/contact` (requiere token de administración)
- `GET /api/admin/session` (valida el token de administración)
- `POST /api/newsletter`
- `POST /api/loyalty`

Los pedidos, suscripciones al newsletter, miembros de lealtad y mensajes de contacto se guardan en MongoDB cuando está configurado; sin MongoDB se conservan en archivos JSON bajo `back/data/` (los contactos en `back/data/contactos.json`). El catálogo local persiste en `back/data/catalog.json`, inicializado desde `back/data/products.json`.

El formulario de contacto valida nombre, correo, asunto y mensaje en el navegador y en el servidor. El panel `/admin-productos.html` valida el token mediante el backend antes de mostrar la administración del catálogo y los mensajes. Las rutas administrativas aceptan `Authorization: Bearer <ADMIN_API_TOKEN>` o `x-admin-token`.

Las imágenes de productos se sirven desde `front/assets/images/`; sus rutas se resuelven desde la página actual, tanto al abrir el HTML directamente como al navegar bajo una subcarpeta. MágicoBot consulta Groq a través de `POST /api/chat` cuando `GROQ_API_KEY` está configurada y conserva la guía local como respuesta de respaldo. Abre `/admin-guia-chatbot.html` para editar su guía, importarla o exportarla en JSON. Cada consulta emite `anthros:assistant-message` con `detail.message` y `detail.answer`.

## Administración del catálogo

Abre `/admin-productos.html` para iniciar sesión, listar y buscar productos, crear, editar o eliminar piezas y consultar los mensajes recibidos. Las lecturas del catálogo son públicas; `POST`, `PUT`, `PATCH` y `DELETE` requieren token. El panel mantiene el token solo en memoria mientras está abierta la pestaña; no lo guarda en `localStorage`.

Configura el token en el entorno del proceso backend antes de habilitar operaciones administrativas. Usa un secreto aleatorio largo, guárdalo en un gestor de secretos y no lo incluyas en el frontend ni en el repositorio. Si el token no está configurado, las escrituras se deshabilitan con HTTP 503. Para crear productos con imágenes, coloca primero el archivo bajo `front/assets/images/` y usa una ruta local como `/assets/images/camiseta.jpg`.

Ejemplo:

```bash
curl "http://localhost:3000/api/products?field=collection&value=Esenciales&limit=20"
curl -X POST "http://localhost:3000/api/products" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"Camiseta Essential","category":"hombres","gender":"Hombre","line":"Básicos","price":88000,"originalPrice":null,"discount":0,"isNew":true,"badge":"Nuevo","sizes":["S","M","L"],"collection":"Esenciales","year":2026,"material":"Algodón orgánico","colors":["Marfil"],"shipping":"3-5 días hábiles","care":"Lavar en frío","img":"/assets/images/camiseta.jpg","desc":"Algodón cómodo de uso diario.","rating":5,"reviews":0}'
```

Los errores de la API usan JSON con `error.code`, `error.message`, `error.status`, un identificador de solicitud y, cuando corresponde, detalles de validación y pasos de ayuda. La tienda muestra los productos guardados en el backend; si la API no está disponible, conserva el catálogo integrado como alternativa y presenta el motivo.

### Variables y MongoDB Atlas opcional

Duplica `.env.example` como `.env` y completa las claves privadas en el servidor (nunca en HTML o JavaScript del navegador). El modo predeterminado usa archivos JSON y no necesita servicios externos:

- `PORT`: puerto HTTP (por defecto `3000`).
- `MONGO_URI`: cadena de conexión Atlas. `MONGODB_URI` sigue disponible como alias heredado.
- `MONGODB_DB`: nombre de la base (opcional; predeterminado `anthros`).
- `MONGODB_COLLECTION`: colección (opcional; predeterminado `products`).
- `ADMIN_API_TOKEN`: token de escritura de administración.
- `CORS_ORIGIN`: lista opcional de orígenes permitidos, separada por comas. También se permiten orígenes `*.netlify.app` y hosts locales de desarrollo.
- `window.ANTHROS_API_URL`: URL raíz del backend cuando el frontend se despliega por separado (por ejemplo, `https://api.ejemplo.com`). Define este valor antes de cargar `assets/js/services/index.js`; si se omite, la API se sirve desde `/api` en el mismo origen.
- `GROQ_API_KEY`: clave de Groq para el chat (opcional).
- `GROQ_MODEL`: modelo Groq (opcional; predeterminado `qwen/qwen3.8-27b`).

Al iniciar con `MONGO_URI`, el servidor conecta Mongoose para pedidos y usa MongoDB para catálogo, cuentas, newsletter y lealtad. Crea índices únicos para IDs de producto, correo y pedidos; carga `back/data/products.json` solo cuando el catálogo está vacío. Ante fallos transitorios de DNS/red cambia a JSON local y `/api/health` reporta `database: "json"`; tras una caída en caliente el proceso permanece en modo local hasta reiniciarse. Los datos escritos durante ese periodo requieren reconciliación antes de volver a usar MongoDB.

El endpoint de registro valida los campos y guarda contraseñas derivadas con scrypt; nunca almacena la contraseña en texto plano ni la devuelve al navegador. El checkout valida los productos y recalcula precios, promociones y envío en el servidor. No hay una pasarela de pago conectada: los pedidos quedan pendientes y el usuario puede enviar el resumen confirmado al WhatsApp de ANTHROS; el formulario no solicita datos de tarjeta.

Los esquemas Mongoose viven en `back/models/`. Para cargar los ejemplos de Brisas de Identidad y Eclipse Urbano en la colección de productos ANTHROS, ejecuta `npm run seed`; el comando no modifica una colección que ya tenga documentos.

## Estructura del proyecto

```text
front/
  index.html, catalogo.html, producto.html, ...
  assets/
    css/styles.css
    icons/*.svg
    images/*
    js/app.js
    js/calculos.js
    js/services/index.js
  admin-productos.html
  admin-guia-chatbot.html
back/
  server.js
  config/database.js
  models/{Producto,Pedido}.js
  routes/{products,orders,chat}.js
  seed.js
  products/{repository,validate-product}.js
  data/{orders,newsletter,loyalty,products,catalog}.json
```

Las páginas HTML permanecen en la raíz de `front/` para conservar las rutas sencillas entre ellas. Los assets se sirven desde `/assets/`; las rutas antiguas `/frontend/...` y de assets en la raíz siguen disponibles como alias de compatibilidad.

El servidor se inicia con `npm start` y el modo de desarrollo con `npm run dev`. El script de validación `npm test` comprueba la sintaxis del servidor y de los scripts JavaScript del frontend.

## Servicios compartidos del frontend

Los scripts de todas las páginas cargan `front/assets/js/services/index.js` antes de la aplicación. El archivo publica el espacio global `AnthrosServices`, organizado por responsabilidad:

- `api`: solicitudes HTTP, cancelación y límite de espera; incluye accesos a salud, productos, pedidos, chat, newsletter y lealtad.
- `integrations`: conversión opcional COP/USD y creación de enlaces directos de pedido a WhatsApp.
- `database`: lectura y actualización de colecciones locales en `localStorage`. No sustituye la base de datos del servidor.
- `storage`: persistencia JSON y de texto con resultados explícitos para errores y datos ausentes.
- `navigation`: navegación interna, anclas, historial y parámetros de búsqueda.
- `document`: selección y creación segura de elementos, eventos delegados, desplazamiento, copia y descarga JSON.
- `validation`: validación de correo, teléfono, rangos y campos; escape de texto HTML.
- `process`: espera cancelable, debounce, throttle y estado temporal de botones.
- `format`: formato localizado de moneda y fechas.

Ejemplos de uso desde los scripts de la página:

```js
const { orders } = await AnthrosServices.api.orders();
const saved = AnthrosServices.storage.setJSON('anthros_preferences_v1', { theme: 'dark' });
AnthrosServices.navigation.goToAnchor('productos');
```
