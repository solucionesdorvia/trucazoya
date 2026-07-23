# @trucazo/engine

Motor de **Truco Argentino**. Puro, determinista y testeable: sin IO, sin aleatoriedad interna, sin dependencias de framework. El servidor lo usa como única fuente de verdad.

## API

```ts
import { createMatch, startRound, applyAction, legalActions, redactStateFor, DEFAULT_RULES } from '@trucazo/engine';

let state = createMatch({ ...DEFAULT_RULES, players: 2 });
state = startRound(state, dealtHands); // dealtHands: Card[][] ya barajadas
const { state: next, events } = applyAction(state, { type: 'PLAY_CARD', seat: 1, card });
const view = redactStateFor(next, 0); // proyección SIN cartas ajenas
```

- `applyAction(state, action)` valida la legalidad, aplica la transición de forma atómica y devuelve `{ state, events }`. Lanza `IllegalActionError` si la acción no es legal.
- `legalActions(state)` devuelve todas las acciones válidas — base para bots, validación de servidor y UI (los botones aparecen sólo si la acción es legal).
- `redactStateFor(state, seat)` proyecta el estado para un jugador: incluye sus cartas y las jugadas públicas, **nunca** las cartas en mano de otros.
- El motor **no baraja**: recibí `shuffle(fullDeck(), rng)` afuera (crypto en prod, semilla en tests).

## Máquina de estados

```
DEALING → PLAYING ⇄ { ENVIDO_PENDING | FLOR_PENDING | TRUCO_PENDING }
        → ROUND_FINISHED → (siguiente ronda | MATCH_FINISHED)
```

## Reglas implementadas

- **Baraja española de 40 cartas** y jerarquía completa del truco (1 espada > 1 basto > 7 espada > 7 oro > 3s > 2s > 1 falso > 12 > 11 > 10 > 7 basto/copa > 6 > 5 > 4).
- **Bazas y pardas:** todas las combinaciones de resolución de ronda (emparda primera, gana+emparda, 1-1 con tercera parda gana la primera, todas parda gana la mano).
- **Envido:** envido, real envido, falta envido, **encadenados**; quiero/no quiero; empate lo gana el más cercano a la mano.
- **Flor:** flor, contraflor, contraflor al resto (configurable con `florEnabled`). "Con flor no hay envido".
- **Truco / retruco / vale cuatro:** con control de quién puede recantar; quiero/no quiero.
- **Mazo** (irse), puntaje a **15 o 30**, fin de partida inmediato al alcanzar el objetivo.
- **1v1 y 2v2** (asientos alternan equipos; envido/flor por equipo).

## Tests y simulador

```bash
pnpm --filter @trucazo/engine test        # 46 tests unitarios + integración
pnpm --filter @trucazo/engine sim 10000   # 10k partidas por escenario
```

El simulador juega partidas completas con bots verificando invariantes (sin estados imposibles, puntajes no negativos, terminación garantizada). Corridas de 30.000 partidas (1v1 con flor, 1v1 a 15 sin flor, 2v2) sin un solo invariante roto, con reparto de victorias ~50/50 (sin sesgo de turnos).

## Limitaciones conocidas (a refinar en pasadas futuras)

- El "envido está primero" (interrumpir un truco pendiente con envido en la primera baza) no está modelado: los cantos se hacen en el turno del jugador. La flor se resuelve como sub-juego con contraflor opcional; contraflor al resto usa el valor de la falta.
- Estas simplificaciones no afectan el cálculo de tantos ni la resolución de bazas, que están cubiertos por tests.
