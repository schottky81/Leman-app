# GEMINI.md - Leman-app

## Project Overview
**Leman-app** is a Homey Pro application (SDK 3) that provides real-time hydrological data for **Lake Geneva (Lac Léman)**. It monitors both water temperature and water level using official Swiss BAFU data.

### Key Technologies
- **Homey SDK 3**: Foundation for the app.
- **Node.js 18+**: Runtime.
- **API**: [existenz.ch API](https://api.existenz.ch/) (Unofficial REST wrapper for BAFU/FOEN data).

### Data Sources
The app aggregates data from two specific BAFU stations on Lac Léman:
- **Water Level**: Station 2027 (Saint-Prex)
- **Water Temperature**: Station 2030 (Morges)

## Building and Running
This project requires the [Homey CLI](https://npm.im/homey).

### Key Commands
- `homey app run`: Launch the app on a Homey Pro in development mode.
- `homey app install`: Deploy and install the app on a Homey Pro.
- `homey app build`: Create a production build (merges `.homeycompose` into `app.json`).
- `homey app validate`: Check for SDK 3 compliance.

## Development Conventions
- **Modular Config**: Uses the `.homeycompose` pattern for capabilities and drivers.
- **Polling**: Data is refreshed every 15 minutes to respect the API and reflect the typical BAFU update frequency (10-30 mins).
- **Localization**: Supports English (`en`) and French (`fr`).

## Implementation Details
- **Capability**: `measure_water_level` (Custom, meters).
- **Capability**: `measure_temperature` (Standard, °C).
- **Device**: A single "Lac Léman" sensor device.
