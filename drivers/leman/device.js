'use strict';

const Homey = require('homey');

class LemanDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Lac Léman Monitor has been initialized');

    // Reference summer average height for Lac Léman (Saint-Prex) is ~372.23m
    this.summerAvgHeight = 372.23;

    // Start polling every 15 minutes
    this.pollInterval = this.homey.setInterval(() => {
      this.pollData();
    }, 1000 * 60 * 15);

    // Initial poll
    await this.pollData();
  }

  /**
   * onUninit is called when the device is uninitialized.
   */
  async onUninit() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }
  }

  /**
   * pollData fetches the latest data from the existenz.ch API and wind forecasts from Open-Meteo.
   */
  async pollData() {
    await this.pollHydroData();
    await this.pollWindForecast();
  }

  /**
   * pollHydroData fetches the latest hydrological data.
   */
  async pollHydroData() {
    try {
      this.log('Polling hydrological data from existenz.ch...');
      
      const response = await fetch('https://api.existenz.ch/apiv1/hydro/latest');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const payload = data.payload;

      // Filter for Station 2027 (Saint-Prex) - Height
      const heightData = payload.find(item => item.loc === '2027' && item.par === 'height');
      if (heightData) {
        const currentHeight = heightData.val;
        this.log(`Updating water level: ${currentHeight} m`);
        await this.setCapabilityValue('measure_water_level', currentHeight);

        // Calculate difference in cm relative to summer average (372.23m)
        const diffCm = Math.round((currentHeight - this.summerAvgHeight) * 100);
        this.lastDiffCm = diffCm;
        await this.setCapabilityValue('measure_water_level_diff', diffCm);
      }

      // Filter for Station 2030 (Morges) - Temperature
      const tempData = payload.find(item => item.loc === '2030' && item.par === 'temperature');
      if (tempData) {
        await this.setCapabilityValue('measure_temperature', tempData.val);
      }

    } catch (err) {
      this.error('Error polling hydro data:', err.message);
    }
  }

  /**
   * pollWindForecast fetches wind forecasts from Open-Meteo (ICON model).
   */
  async pollWindForecast() {
    try {
      this.log('Polling wind forecast from Open-Meteo (Morges)...');

      // Coordinates for Morges: 46.51, 6.50
      // Requesting wind speed, gusts and direction
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=46.51&longitude=6.50&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=Europe%2FBerlin&models=icon_seamless&forecast_days=1';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.hourly || !data.hourly.wind_speed_10m) {
        throw new Error('Invalid forecast data received');
      }

      const hourly = data.hourly;
      let maxWindToday = 0;
      let maxGustToday = 0;
      let isKitePossible = false;
      let isStrongWind = false;
      let isPumpFoil = false;
      
      // Current or upcoming wind direction
      let currentWindDir = 0;
      const now = new Date();
      let closestHourIndex = 0;
      let minTimeDiff = Infinity;

      // Filter for daytime: 08:00 to 20:00
      for (let i = 0; i < hourly.time.length; i++) {
        const time = new Date(hourly.time[i]);
        const hour = time.getHours();
        
        const timeDiff = Math.abs(time - now);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestHourIndex = i;
        }

        if (hour >= 8 && hour <= 20) {
          const windSpeed = hourly.wind_speed_10m[i];
          const gustSpeed = hourly.wind_gusts_10m[i];

          if (windSpeed > maxWindToday) maxWindToday = windSpeed;
          if (gustSpeed > maxGustToday) maxGustToday = gustSpeed;
        }
      }

      currentWindDir = hourly.wind_direction_10m[closestHourIndex];

      // Thresholds
      if (maxWindToday >= 12) isKitePossible = true;
      if (maxGustToday >= 25) isStrongWind = true;
      
      // Pump Foil: max wind <= 5kn AND water level diff < -36cm
      if (maxWindToday <= 5 && this.lastDiffCm < -36) {
        isPumpFoil = true;
      }

      // Wind direction text logic
      let windDirText = 'Variable';
      if (currentWindDir >= 22.5 && currentWindDir < 67.5) windDirText = 'Bise (NE)';
      else if (currentWindDir >= 67.5 && currentWindDir < 112.5) windDirText = 'Est';
      else if (currentWindDir >= 112.5 && currentWindDir < 157.5) windDirText = 'Sud-Est';
      else if (currentWindDir >= 157.5 && currentWindDir < 202.5) windDirText = 'Vent (S)';
      else if (currentWindDir >= 202.5 && currentWindDir < 247.5) windDirText = 'Sud-Ouest';
      else if (currentWindDir >= 247.5 && currentWindDir < 292.5) windDirText = 'Vent (W)';
      else if (currentWindDir >= 292.5 && currentWindDir < 337.5) windDirText = 'Joran (NW)';
      else if (currentWindDir >= 337.5 || currentWindDir < 22.5) windDirText = 'Nord';

      this.log(`Max wind: ${maxWindToday} kn, Max gust: ${maxGustToday} kn, Dir: ${currentWindDir}° (${windDirText}), Pump Foil: ${isPumpFoil}`);
      
      await this.setCapabilityValue('measure_wind_max', maxWindToday);
      await this.setCapabilityValue('measure_wind_gust_max', maxGustToday);
      await this.setCapabilityValue('measure_wind_direction', currentWindDir);
      await this.setCapabilityValue('measure_wind_direction_text', windDirText);
      // Update icons first, then value (sometimes helps UI refresh)
      if (this.hasCapability('kite_conditions')) {
        await this.setCapabilityOptions('kite_conditions', { 
          icon: isKitePossible ? 'assets/kite_ok.svg' : 'assets/kite.svg' 
        }).catch(err => this.error('Icon err:', err));
      }
      await this.setCapabilityValue('kite_conditions', isKitePossible);

      await this.setCapabilityValue('alarm_strong_wind', isStrongWind);

      if (this.hasCapability('pump_foil_conditions')) {
        await this.setCapabilityOptions('pump_foil_conditions', { 
          icon: isPumpFoil ? 'assets/foil_ok.svg' : 'assets/foil.svg' 
        }).catch(err => this.error('Icon err:', err));
      }
      await this.setCapabilityValue('pump_foil_conditions', isPumpFoil);

    } catch (err) {
      this.error('Error polling wind forecast:', err.message);
    }
  }

}

module.exports = LemanDevice;
