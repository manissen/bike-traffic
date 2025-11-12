import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoibWFuaXNzZW4iLCJhIjoiY21od2lxZTFnMDAwZTJqb3V0NTkxaWNhZyJ9.LLSxdhNJYRKx9vgNgHXw7A';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function formatTime(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const hour12 = hrs % 12 === 0 ? 12 : hrs % 12;
    return `${hour12}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1
      ? trips // If no filter is applied (-1), return all trips
      : trips.filter((trip) => {
          // Convert trip start and end times to minutes since midnight
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
  
          // Include trips that started or ended within 60 minutes of the selected time
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });
}

map.on('load', async () => {
    const container = map.getCanvasContainer();
    const svg = d3.select(container)
      .append('svg')
      .attr('class', 'd3-overlay')
      .style('position', 'absolute')
      .style('top', 0)
      .style('left', 0)
      .style('width', '100%')
      .style('height', '100%')
      .style('pointer-events', 'none');
  
    // Add bike routes
    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });
    map.addLayer({
      id: 'bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: {
        'line-color': 'green',
        'line-width': 3,
        'line-opacity': 0.4,
      },
    });
    map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });
    map.addLayer({
      id: 'bike-lanes-cam',
      type: 'line',
      source: 'cambridge_route',
      paint: {
        'line-color': 'green',
        'line-width': 3,
        'line-opacity': 0.4,
      },
    });
  
    try {
      const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
      const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
  
      // Load data
      const jsonData = await d3.json(jsonurl);
      let trips = await d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        (trip) => {
          trip.started_at = new Date(trip.started_at);
          trip.ended_at = new Date(trip.ended_at);
          return trip;
        },
      );
      let stations = computeStationTraffic(jsonData.data.stations, trips);
  
      // Create square-root scale for circle radius
      const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, d => d.total_trips)])
        .range([0, 25]);
  
      // Draw circles
      const circles = svg.selectAll('circle')
        .data(stations, (d) => d.short_name)
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.total_trips))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.6)
        .style('pointer-events', 'auto')
        .append('title')
        .text(d => `${d.total_trips} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
  
      // Position circles
      function updatePositions() {
        circles
          .attr('cx', d => getCoords(d).cx)
          .attr('cy', d => getCoords(d).cy);
      }

      updatePositions();
      map.on('move', updatePositions);
      map.on('zoom', updatePositions);
      map.on('resize', updatePositions);
      map.on('moveend', updatePositions);
  
      // Time slider logic
      let timeFilter = -1;
      const timeSlider = document.getElementById('time-slider');
      const selectedTime = document.getElementById('selected-time');
      const anyTimeLabel = document.getElementById('any-time');
  
      function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value); // Get slider value
      
        if (timeFilter === -1) {
          selectedTime.textContent = ''; // Clear time display
          anyTimeLabel.style.display = 'block'; // Show "(any time)"
        } else {
          selectedTime.textContent = formatTime(timeFilter); // Display formatted time
          anyTimeLabel.style.display = 'none'; // Hide "(any time)"
        }
      
        // Call updateScatterPlot to reflect the changes on the map
        updateScatterPlot(timeFilter);
      }

      function updateScatterPlot(timeFilter) {
        // Filter trips and recompute station traffic
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);
      
        // Adjust circle size scale based on filter
        timeFilter === -1
          ? radiusScale.range([0, 25])
          : radiusScale.range([3, 50]);
      
        // Rebind data to circles, preserving station mapping by key
        circles
          .data(filteredStations, (d) => d.short_name)
          .join(
            enter => enter
              .append('circle')
              .attr('fill', 'steelblue')
              .attr('stroke', 'white')
              .attr('stroke-width', 1)
              .attr('opacity', 0.6)
              .append('title')
              .text(d => `${d.total_trips} trips (${d.departures} departures, ${d.arrivals} arrivals)`),
            update => update,
            exit => exit.remove()
          )
          .attr('r', (d) => radiusScale(d.totalTraffic))
          .select('title')
          .text(d => `${d.total_trips} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      }
      
  
      timeSlider.addEventListener('input', updateTimeDisplay);
      updateTimeDisplay();
  
    } catch (error) {
      console.error('Error loading data:', error);
    }
  });
  

function computeStationTraffic(stations, trips) {
    // Compute departures
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id,
    );
  
    // Computed arrivals as you did in step 4.2
    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id,
    );

    // Update each station..
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.total_trips = station.arrivals + station.departures;
      return station;
    });
}
