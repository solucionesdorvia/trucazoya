# Barajas españolas — candidatas (assets con licencia libre)

Búsqueda y verificación de sets de imágenes de baraja española (40 cartas: espada,
basto, oro, copa · valores 1–7, 10, 11, 12) usables en Trucazo, con licencia libre.

Fecha: 2026-07-29. Todos los repos citados fueron devueltos por una búsqueda real
(`gh search` / GitHub topics / Wikimedia) y verificados con una request a su API/contenido.

## Tabla comparativa

| Repo / fuente | Licencia | Formato | ¿40/40? | Dorso | Resolución / viewBox | Peso | Último commit | Riesgo legal | Veredicto |
|---|---|---|---|---|---|---|---|---|---|
| [gjenkins20/spanish-playing-cards-svg](https://github.com/gjenkins20/spanish-playing-cards-svg) | CC BY-SA 3.0 (en README, atribuye a Basquetteur/Wikimedia) | **SVG** | Sí (48 → recortable a 40) | Sí (`card_back.svg`) | viewBox ~66×102 (escalable) | Pesado: 0.48–1.6 MB/carta, repo ~15 MB | 2026-02-15 · activo | **Bajo** — arte CC BY-SA rastreable a Wikimedia; exige atribución + ShareAlike | ✅ **#1** (con optimización) |
| [maxogod/Truco](https://github.com/maxogod/Truco) (`truco-front/src/assets/Cards`) | MIT (archivo LICENSE) | PNG RGBA | **Sí, 40 exactas** (1-7,10,11,12) | Sí (`0-back.png`) | 104×160 px (bajo) | ~1–4 KB/carta | 2024-07-14 | **Medio-alto** — MIT cubre el código; **sin créditos del arte**, posible ripeo de app comercial | ⚠️ #2 (drop-in, pero verificar origen) |
| [AlbertoCruzLuis/Spanish-Deck-Images](https://github.com/AlbertoCruzLuis/Spanish-Deck-Images) | MIT (LICENSE.txt) | **JPG** (sin alfa) | Sí (48) | No | 262×400 px | ~20–37 KB/carta | 2021-05-27 | **Medio-alto** — JPG escaneado (EXIF Google), arte sin atribución; MIT no aclara el arte | ⚠️ #3 (fallback pobre) |
| [Basquetteur / Germarquezm en Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Spanish_playing_cards) | CC BY-SA 3.0 | SVG (mazo entero en un archivo) | Parcial: "Baraja española.svg" (Germarquezm) está **incompleta**; la de Basquetteur está laid-out | — | 2496×1595 (todo el mazo) | 1.2–3.9 MB (un archivo) | — | Bajo | 📌 **Fuente** — mejor calidad, pero hay que **recortar** el mazo en cartas |

## Ranking y recomendación

**#1 — gjenkins20/spanish-playing-cards-svg (CC BY-SA 3.0).**
Es el único candidato con una **licencia de contenido clara y rastreable para el arte**
(CC BY-SA 3.0, obra de *Basquetteur* en Wikimedia Commons). Trae los 4 palos completos en
SVG escalable + dorso, con nomenclatura predecible. Su punto débil es el **peso**: son
auto-traces de Inkscape (0.48–1.6 MB por carta), así que hay que pasarlos por `svgo` antes de
producción (se reducen mucho; siguen siendo vectores, sin rasters embebidos — verificado). En
un contexto de dinero real conviene precisamente esta licencia auditable por sobre la
comodidad de los repos MIT.

- Obligación: incluir la atribución (ver abajo) y mantener los assets bajo CC BY-SA 3.0.
  No obliga a licenciar el código de la app, solo las **cartas** (y sus derivados).

**#2 — maxogod/Truco (MIT).**
Técnicamente ideal: **40 cartas exactas** + dorso, PNG con transparencia real y naming
`valor-palo.png` idéntico al que ya usa Trucazo. Pero (a) **104×160 px** es bajo para
producción y no escala, y (b) **el README no acredita el arte** → riesgo de que sean cartas
ripeadas de una app comercial, que el MIT del repo **no** legaliza. Usable para un prototipo,
pero **no** recomendado para lanzar con plata real sin confirmar el origen con el autor.

**#3 — AlbertoCruzLuis/Spanish-Deck-Images (MIT).**
JPG sin transparencia, 262×400, escaneado. Mismo problema de origen que #2, y peor formato.
Solo como último recurso.

### Recomendación operativa
1. **Para producción con licencia limpia:** partir del **arte de Basquetteur (CC BY-SA 3.0)**.
   Camino corto: usar #1 (gjenkins, ya cortado en cartas) y optimizarlo con `svgo`. Camino de
   máxima calidad: recortar el laid-out original de Commons en 40 cartas + redibujar el dorso.
2. **Atribución requerida** (ponerla en `/creditos` o el footer):
   > Arte de las cartas por Basquetteur (Wikimedia Commons), licencia CC BY-SA 3.0.
   > https://creativecommons.org/licenses/by-sa/3.0/

> Nota de licencia estricta: gjenkins declara CC BY-SA 3.0 en el **README** (no en un archivo
> `LICENSE`). La declaración es explícita y atribuye la fuente, pero si se quiere rigor formal,
> conviene fijar la procedencia citando directamente a Basquetteur/Wikimedia (misma licencia).

## Mapeo carta → archivo (para el ganador #1)

```ts
// gjenkins20/spanish-playing-cards-svg  ·  archivos: card_<suit>_<NN>.svg
// suits: coins=oro, cups=copa, swords=espada, clubs=basto ; NN = 01..12
export const PALO_A_ARCHIVO = {
  oro: 'coins',
  copa: 'cups',
  espada: 'swords',
  basto: 'clubs',
} as const;

/** Ruta del SVG para una carta de truco (rank ∈ 1-7,10,11,12). */
export function archivoCarta(rank: number, palo: keyof typeof PALO_A_ARCHIVO): string {
  return `card_${PALO_A_ARCHIVO[palo]}_${String(rank).padStart(2, '0')}.svg`;
}

export const ARCHIVO_DORSO = 'card_back.svg';
// Ej: archivoCarta(1, 'espada') → 'card_swords_01.svg'
//     archivoCarta(12, 'copa')  → 'card_cups_12.svg'
```

## Muestras descargadas

En `assets/decks/` (2 muestras por candidato, verificadas):

- `gjenkins20-spanish-playing-cards-svg/` — `card_swords_01.svg` (479 KB), `card_cups_12.svg` (1.6 MB). Vector puro, sin raster embebido, fondo transparente. ✔
- `maxogod-Truco/` — `1-espada.png`, `12-copa.png`, `0-back.png`. PNG RGBA 104×160, con alfa real. ✔
- `AlbertoCruzLuis-Spanish-Deck-Images/` — `1Swords.jpg`, `12Cups.jpg`. JPEG 262×400, sin alfa. ✔

## Queries ejecutadas (trazabilidad)

`gh search repos`: `truco cartas`, `spanish playing cards svg`, `naipes españoles`, `spanish deck cards`,
`mus cartas`, `baraja-espanola`, `naipes`, `spanish-deck`, `barajaespanola`, `truco-game`, `naipes svg`,
`brisca cartas assets`, `tute cartas svg`, `escoba baraja cartas`, `truco react svg cartas`,
`spanish deck svg cards`.
`gh search code`: `card_espada`, `cards.json "oros copas espadas bastos"`.
GitHub topics: `baraja-espanola`.
Wikimedia Commons: categoría `Spanish playing cards` + archivos `Baraja española.svg`.

Descartados por licencia copyleft de código (no aptos para el arte / GPL): `Webierta/siete_media` (GPL-3.0),
`fabianfiorotto/TrucoArgentino` (GPL-3.0), `lucas-ifsp/CTruco` (GPL-3.0), `p4bl1t0/truco-argento` (GPL-3.0).
Descartados por no traer assets de imagen (solo lógica): `encisoda/Truco`, `arielger/truco`, `jcbp/VirtualTruco`, etc.
