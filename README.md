# Sensor Dashboard

A modular, widget-based browser dashboard ("Grafana for Arduino") that streams live sensor
data from an Arduino Uno R4 to a React frontend in real time, and sends control commands
back to the Arduino. Data flow: **Arduino (C++) ⇄ Node serial bridge ⇄ WebSocket ⇄ React**.

See [CLAUDE.md](./CLAUDE.md) for the full project contract (protocol, WS message shapes,
working principles) and [PLAN.md](./PLAN.md) for the execution plan.

## Quick start (mock mode, no hardware required)

```bash
nvm use                     # activates the pinned Node LTS (see .nvmrc)
cp .env.example backend/.env
cp .env.example frontend/.env   # only the VITE_ vars are read by Vite

npm --prefix backend install
npm --prefix frontend install

# Run in two separate terminals (reliable path):
npm --prefix backend run dev     # terminal 1 — backend on :8080, SERIAL_SOURCE=mock by default
npm --prefix frontend run dev    # terminal 2 — frontend on :5173

# Or, as a convenience, from repo root:
npm run dev
```

Open http://localhost:5173 — the connection bar should show "connected" and the ultrasonic
widget should update live with mock data (~20 Hz).

To run against a real Arduino Uno R4 instead, set `SERIAL_SOURCE=real` and
`SERIAL_PATH=/dev/cu.usbmodemXXXX` in `backend/.env` (find the port via `GET /ports` or
`ls /dev/cu.usbmodem*`).

## Requirements

- Node.js LTS (24.x, pinned in `.nvmrc`) — **not** Node 25, which is end-of-life.
- `nvm` to manage the Node version (`brew install nvm`).

## Folder map

```
arduino/     Arduino sketch(es) — flashed via Arduino IDE
backend/     Express + ws + serialport bridge (ESM, Node LTS)
frontend/    React + Vite + Tailwind + Recharts dashboard
```
