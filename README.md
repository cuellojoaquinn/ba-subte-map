# BA Subte Map

Mapa interactivo del subte de Buenos Aires, con secciones para aprender de memoria las
estaciones y saber qué línea tomar según tu barrio.

![Mapa de Subte](ba-subte-map/map-visualization.png)
## Qué hace

- **Mapa** — trazado real de las 6 líneas de subte (A, B, C, D, E, H) con sus estaciones,
  superpuesto a los barrios de CABA. Cada barrio se colorea según la línea que lo cruza
  (calculado por intersección geográfica real, no a mano), y al pasar el mouse se resalta
  tanto el barrio en el mapa como las líneas correspondientes en el panel lateral.
- **Memorizar** — flashcards por estación: nombre de un lado, línea + barrio + combinaciones
  del otro. Filtrable por línea, con progreso guardado en el dispositivo.
- **Quiz** — preguntas al azar ("¿en qué línea/barrio está esta estación?"), con racha y
  aciertos guardados.
- **¿Qué subte tomo?** — elegís tu barrio o buscás una estación por nombre y te dice qué
  líneas y estaciones tenés cerca.

Todo (barrio de cada estación, combinaciones entre líneas) se calcula en el momento a partir
de los datos geográficos reales — no hay una lista escrita a mano que se pueda desactualizar.

## Stack

- [Angular 21](https://angular.dev/) standalone, **zoneless** (sin `zone.js`; el estado
  reactivo se maneja con `signal()`).
- [Leaflet](https://leafletjs.com/) para el mapa base.
- [Turf.js](https://turfjs.org/) para los cálculos geoespaciales (qué barrio cruza qué línea,
  en qué barrio cae cada estación, qué estaciones de distinta línea están a pocos metros).
- Datos abiertos de [data.buenosaires.gob.ar](https://data.buenosaires.gob.ar/) (líneas y
  estaciones de subte, barrios de CABA).

## Desarrollo

Requiere [Yarn](https://yarnpkg.com/) (ver `packageManager` en `package.json`).

```bash
yarn install
yarn start      # levanta el servidor de desarrollo en http://localhost:4200
yarn test       # corre los tests con Vitest
yarn build      # build de producción en dist/
```

## Estructura

```
src/app/
  map/                 mapa real con Leaflet (barrios + líneas + estaciones)
  aprender/
    memorizar/         flashcards
    quiz/               preguntas al azar
    donde/              buscador por barrio / estación
  services/
    subte-barrios.ts    carga y cruza los datos geográficos (barrios, líneas, estaciones)
    progreso.ts         progreso de memorizar/quiz persistido en localStorage
public/
  barrios.geojson           barrios de CABA
  subte-lineas.geojson      trazado real de las líneas
  subte-estaciones.geojson  estaciones (paradas)
```
