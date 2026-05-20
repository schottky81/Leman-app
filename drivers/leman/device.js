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
    
    // Store last diff in memory
    this.lastDiffCm = this.getCapabilityValue('measure_water_level_diff') || 0;

    // Start polling schedule
    this.schedulePolling();

    // Initial poll
    await this.pollData();
  }

  /**
   * onUninit is called when the device is uninitialized.
   */
  async onUninit() {
    this.clearPolling();
  }

  /**
   * schedulePolling starts or restarts the polling interval timer.
   */
  schedulePolling() {
    this.clearPolling();
    
    const intervalMinutes = this.getSetting('polling_interval') || 15;
    this.log(`Scheduling polling interval to ${intervalMinutes} minutes`);
    
    this.pollInterval = this.homey.setInterval(() => {
      this.pollData().catch(err => this.error('Error during scheduled pollData:', err.message));
    }, 1000 * 60 * intervalMinutes);
  }

  /**
   * clearPolling clears the active polling timer.
   */
  clearPolling() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * onSettings is called when device settings are updated in Homey.
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);
    
    // If polling interval changed, reschedule
    if (changedKeys.includes('polling_interval')) {
      this.schedulePolling();
    }
    
    // Trigger immediate refresh after settings change
    this.homey.setTimeout(async () => {
      this.log('Performing immediate refresh after settings change...');
      await this.pollData();
    }, 1000);
  }

  /**
   * getZurichOffset calculates the current CET/CEST timezone offset (+01:00 or +02:00) for Switzerland.
   */
  getZurichOffset(date) {
    try {
      const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Zurich',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
      }).formatToParts(date);

      const utcParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
      }).formatToParts(date);

      const getPart = (parts, type) => parseInt(parts.find(p => p.type === type).value, 10);

      const tzDate = new Date(Date.UTC(
        getPart(tzParts, 'year'),
        getPart(tzParts, 'month') - 1,
        getPart(tzParts, 'day'),
        getPart(tzParts, 'hour'),
        getPart(tzParts, 'minute'),
        getPart(tzParts, 'second')
      ));

      const utcDate = new Date(Date.UTC(
        getPart(utcParts, 'year'),
        getPart(utcParts, 'month') - 1,
        getPart(utcParts, 'day'),
        getPart(utcParts, 'hour'),
        getPart(utcParts, 'minute'),
        getPart(utcParts, 'second')
      ));

      const diffMinutes = Math.round((tzDate - utcDate) / (1000 * 60));
      const absMinutes = Math.abs(diffMinutes);
      const hours = Math.floor(absMinutes / 60).toString().padStart(2, '0');
      const mins = (absMinutes % 60).toString().padStart(2, '0');
      const sign = diffMinutes >= 0 ? '+' : '-';
      return `${sign}${hours}:${mins}`;
    } catch (err) {
      this.error('Error determining Switzerland timezone offset:', err.message);
      return '+02:00'; // Default fallback
    }
  }

  /**
   * updateCapabilityAndTriggerFlow updates custom boolean capability and fires flow trigger if changed
   */
  async updateCapabilityAndTriggerFlow(capabilityId, flowCardId, value) {
    const oldValue = this.getCapabilityValue(capabilityId);
    if (oldValue !== value) {
      await this.setCapabilityValue(capabilityId, value);
      this.log(`Capability ${capabilityId} changed from ${oldValue} to ${value}. Triggering Flow card: ${flowCardId}`);
      this.homey.flow.getDeviceTriggerCard(flowCardId)
        .trigger(this, { active: value })
        .catch(err => this.error(`Error triggering ${flowCardId}:`, err.message));
    }
  }

  /**
   * updateNumberAndTriggerFlow updates custom numerical capability and fires flow trigger if changed
   */
  async updateNumberAndTriggerFlow(capabilityId, flowCardId, value, tokenName) {
    const oldValue = this.getCapabilityValue(capabilityId);
    if (oldValue !== value) {
      await this.setCapabilityValue(capabilityId, value);
      this.log(`Capability ${capabilityId} changed from ${oldValue} to ${value}. Triggering Flow card: ${flowCardId}`);
      this.homey.flow.getDeviceTriggerCard(flowCardId)
        .trigger(this, { [tokenName]: value })
        .catch(err => this.error(`Error triggering ${flowCardId}:`, err.message));
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
      const levelStation = this.getSetting('station_water_level') || '2027';
      const tempStation = this.getSetting('station_water_temp') || '2030';
      
      this.log(`Polling hydrological data from existenz.ch (Level Station: ${levelStation}, Temp Station: ${tempStation})...`);
      
      const response = await fetch('https://api.existenz.ch/apiv1/hydro/latest');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const payload = data.payload;

      // Filter for Level Station
      const heightData = payload.find(item => item.loc === levelStation && item.par === 'height');
      if (heightData) {
        const currentHeight = heightData.val;
        this.log(`Updating water level: ${currentHeight} m`);
        await this.updateNumberAndTriggerFlow('measure_water_level', 'water_level_changed', currentHeight, 'level');

        // Calculate difference in cm relative to summer average (372.23m)
        const diffCm = Math.round((currentHeight - this.summerAvgHeight) * 100);
        this.lastDiffCm = diffCm;
        await this.updateNumberAndTriggerFlow('measure_water_level_diff', 'water_level_diff_changed', diffCm, 'diff');
      } else {
        this.error(`Could not find water level data for station: ${levelStation}`);
      }

      // Filter for Temp Station
      const tempData = payload.find(item => item.loc === tempStation && item.par === 'temperature');
      if (tempData) {
        this.log(`Updating water temperature: ${tempData.val} °C`);
        await this.setCapabilityValue('measure_temperature', tempData.val);
      } else {
        this.error(`Could not find water temperature data for station: ${tempStation}`);
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
      const lat = this.getSetting('gps_lat') || 46.51;
      const lon = this.getSetting('gps_lon') || 6.50;
      
      const kiteThreshold = this.getSetting('kite_wind_min') || 12;
      const foilWindThreshold = this.getSetting('pump_foil_wind_max') || 8;
      const foilWindThresholdBise = this.getSetting('pump_foil_wind_max_bise') || 12;
      const foilLevelThreshold = this.getSetting('pump_foil_level_min') || -36;
      const strongWindThreshold = this.getSetting('strong_wind_min') || 25;
      
      this.log(`Polling wind forecast from Open-Meteo for Lat: ${lat}, Lon: ${lon}...`);

      // Coordinates for location
      // Requesting wind speed, gusts and direction
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=Europe%2FBerlin&models=icon_seamless&forecast_days=1`;
      
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
      this.log(`Homey UTC Time: ${now.toISOString()}`);
      
      let closestHourIndex = 0;
      let minTimeDiff = Infinity;
      const offsetString = this.getZurichOffset(now);
      this.log(`Determined Swiss timezone offset for current date: ${offsetString}`);

      // Filter for daytime: 08:00 to 20:00
      for (let i = 0; i < hourly.time.length; i++) {
        // Parse time using dynamic CEST/CET offset determined above
        const forecastTime = new Date(hourly.time[i] + ':00' + offsetString);
        
        const timeDiff = Math.abs(forecastTime - now);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestHourIndex = i;
        }

        const hour = forecastTime.getHours();
        if (hour >= 8 && hour <= 20) {
          const windSpeed = hourly.wind_speed_10m[i];
          const gustSpeed = hourly.wind_gusts_10m[i];

          if (windSpeed > maxWindToday) maxWindToday = windSpeed;
          if (gustSpeed > maxGustToday) maxGustToday = gustSpeed;
        }
      }

      currentWindDir = hourly.wind_direction_10m[closestHourIndex];
      const currentWindSpeed = hourly.wind_speed_10m[closestHourIndex];
      
      this.log(`Selected forecast time: ${hourly.time[closestHourIndex]} (Index: ${closestHourIndex})`);
      this.log(`Current forecasted wind: ${currentWindSpeed} kn`);

      // Near future wind (max of current hour and next hour if available)
      let nearFutureWind = currentWindSpeed;
      if (closestHourIndex + 1 < hourly.wind_speed_10m.length) {
        nearFutureWind = Math.max(currentWindSpeed, hourly.wind_speed_10m[closestHourIndex + 1]);
        this.log(`Next hour forecasted wind: ${hourly.wind_speed_10m[closestHourIndex + 1]} kn`);
      }
      this.log(`Resulting nearFutureWind (max): ${nearFutureWind} kn`);
      this.log(`Water Level Diff: ${this.lastDiffCm} cm`);

      // Kite conditions evaluation
      if (nearFutureWind >= kiteThreshold || maxWindToday >= kiteThreshold) {
        isKitePossible = true;
      }
      
      // Strong wind alarm evaluation
      if (maxGustToday >= strongWindThreshold) {
        isStrongWind = true;
      }
      
      // Pump Foil conditions evaluation
      // Bise direction is widened to the 15° to 80° range to handle direction fluctuations
      const isBiseDirection = (currentWindDir >= 15 && currentWindDir <= 80);
      const activeFoilWindThreshold = isBiseDirection ? foilWindThresholdBise : foilWindThreshold;
      
      this.log(`Evaluating Pump Foil: Active Wind Threshold = ${activeFoilWindThreshold} kn (Bise wind direction matched: ${isBiseDirection}, current wind: ${nearFutureWind} kn, water diff: ${this.lastDiffCm} cm)`);

      if (nearFutureWind <= activeFoilWindThreshold && this.lastDiffCm > foilLevelThreshold) {
        isPumpFoil = true;
      }

      // Wind direction text logic
      let windDirText = 'Variable';
      if (currentWindDir >= 15 && currentWindDir <= 80) windDirText = 'Bise (NE)';
      else if (currentWindDir > 80 && currentWindDir < 112.5) windDirText = 'Est';
      else if (currentWindDir >= 112.5 && currentWindDir < 157.5) windDirText = 'Sud-Est';
      else if (currentWindDir >= 157.5 && currentWindDir < 202.5) windDirText = 'Vent (S)';
      else if (currentWindDir >= 202.5 && currentWindDir < 247.5) windDirText = 'Sud-Ouest';
      else if (currentWindDir >= 247.5 && currentWindDir < 292.5) windDirText = 'Vent (W)';
      else if (currentWindDir >= 292.5 && currentWindDir < 337.5) windDirText = 'Joran (NW)';
      else if (currentWindDir >= 337.5 || currentWindDir < 15) windDirText = 'Nord';

      this.log(`Max wind: ${maxWindToday} kn, Max gust: ${maxGustToday} kn, Dir: ${currentWindDir}° (${windDirText})`);
      
      await this.setCapabilityValue('measure_wind_max', maxWindToday);
      await this.setCapabilityValue('measure_wind_gust_max', maxGustToday);
      await this.setCapabilityValue('measure_wind_direction', currentWindDir);
      await this.setCapabilityValue('measure_wind_direction_text', windDirText);
      
      // Update boolean states and trigger flows if they changed
      await this.updateCapabilityAndTriggerFlow('kite_conditions', 'kite_conditions_changed', isKitePossible);
      await this.updateCapabilityAndTriggerFlow('alarm_strong_wind', 'alarm_strong_wind_changed', isStrongWind);
      await this.updateCapabilityAndTriggerFlow('pump_foil_conditions', 'pump_foil_conditions_changed', isPumpFoil);

    } catch (err) {
      this.error('Error polling wind forecast:', err.message);
    }
  }

}

module.exports = LemanDevice;
