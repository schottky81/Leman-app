# GEMINI.md - Leman-app

## Project Overview
**Leman-app** is a Homey Pro application (SDK 3) that provides real-time hydrological data for **Lake Geneva (Lac Léman)**. It monitors both water temperature and water level using official Swiss BAFU data.

### Key Technologies
- **Homey SDK 3**: Foundation for the app.
- **Node.js 18+**: Runtime.
- **Hydro API**: [existenz.ch API](https://api.existenz.ch/) (Unofficial REST wrapper for BAFU/FOEN data).
- **Meteo API**: [Open-Meteo](https://open-meteo.com/) (Using MeteoSwiss ICON model).

### Data Sources
The app aggregates data from several sources:
- **Water Level**: Station 2027 (Saint-Prex) via existenz.ch.
- **Water Temperature**: Station 2030 (Morges) via existenz.ch.
- **Wind Forecast**: Open-Meteo (ICON-Seamless model) for coordinates 46.51, 6.50 (Morges).

## Building and Running
This project requires the [Homey CLI](https://npm.im/homey).

### Key Commands
- `homey app run`: Launch the app on a Homey Pro in development mode.
- `homey app install`: Deploy and install the app on a Homey Pro.
- `homey app build`: Create a production build (merges `.homeycompose` into `app.json`).
- `homey app validate`: Check for SDK 3 compliance.

## Development Conventions
- **Modular Config**: Uses the `.homeycompose` pattern for capabilities and drivers.
- **Polling**: Data is refreshed every 15 minutes.
- **Localization**: Supports English (`en`) and French (`fr`).

## Implementation Details
- **Capability**: `measure_water_level` (Custom, meters).
- **Capability**: `measure_temperature` (Standard, °C).
- **Capability**: `kite_conditions` (Custom, Boolean). Indicates if wind forecast is > 12 knots during daytime (08:00 - 20:00).
- **Capability**: `pump_foil_conditions` (Custom, Boolean). Indicates if wind/water conditions are suitable for pump foil.
- **Capability**: `measure_wind_max` (Custom, knots). Max forecasted average wind speed for the day.
- **Device**: A single "Lac Léman" sensor device.
