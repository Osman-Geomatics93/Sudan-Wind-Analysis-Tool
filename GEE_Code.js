// Sudan Wind Analysis with Fixed Charts

// Import Sudan boundary
var sudan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Sudan'));

// Time parameters
var timeParams = {
  startYear: 2006,
  endYear: 2007,
  startDate: '2006-01-01',
  endDate: '2007-12-31',
  months: ee.List.sequence(1, 12),
  years: ee.List.sequence(2006, 2007)
};

// Load and clip datasets
var windDataset = ee.ImageCollection("NASA/FLDAS/NOAH01/C/GL/M/V001")
  .filterBounds(sudan)
  .filterDate(timeParams.startDate, timeParams.endDate)
  .select('Wind_f_tavg')
  .map(function(image) {
    return image.clip(sudan);
  });

// Get elevation data
var elevation = ee.Image('USGS/SRTMGL1_003').clip(sudan);

// Calculate wind-elevation correlation
var meanWind = windDataset.mean();

// Create sample points across Sudan
var points = ee.FeatureCollection.randomPoints({
  region: sudan,
  points: 500,
  seed: 123
});

// Sample both wind and elevation at these points
var sampledData = meanWind.addBands(elevation).reduceRegions({
  collection: points,
  reducer: ee.Reducer.mean(),
  scale: 11000
});

// Calculate monthly statistics
var monthlyStats = ee.FeatureCollection(
  timeParams.years.map(function(y) {
    return timeParams.months.map(function(m) {
      var monthly = windDataset
        .filter(ee.Filter.calendarRange(y, y, 'year'))
        .filter(ee.Filter.calendarRange(m, m, 'month'));
      
      var monthlyMean = monthly.mean();
      
      var stats = monthlyMean.reduceRegion({
        reducer: ee.Reducer.mean()
          .combine(ee.Reducer.stdDev(), '', true)
          .combine(ee.Reducer.percentile([10, 90]), '', true),
        geometry: sudan,
        scale: 11000,
        maxPixels: 1e9
      });
      
      return ee.Feature(null, {
        year: y,
        month: m,
        wind_speed: stats.get('Wind_f_tavg_mean'),
        std_dev: stats.get('Wind_f_tavg_stdDev'),
        p10: stats.get('Wind_f_tavg_p10'),
        p90: stats.get('Wind_f_tavg_p90')
      });
    });
  }).flatten()
);

// Create advanced charts
function createCharts() {
  var panel = ui.Panel({
    style: {
      width: '800px',
      height: '1000px',
      position: 'bottom-right',
      padding: '8px'
    }
  });

  // 1. Monthly Wind Speed Time Series
  var timeSeriesChart = ui.Chart.feature.byFeature({
    features: monthlyStats,
    xProperty: 'month',
    yProperties: ['wind_speed']
  })
  .setChartType('LineChart')
  .setOptions({
    title: 'Monthly Average Wind Speed',
    vAxis: {
      title: 'Wind Speed (m/s)',
      viewWindow: {min: 0},
      gridlines: {count: 8}
    },
    hAxis: {
      title: 'Month',
      gridlines: {count: 12},
      viewWindow: {min: 1, max: 12}
    },
    lineWidth: 2,
    pointSize: 4,
    series: {0: {color: '#1b9e77'}},
    legend: {position: 'none'},
    trendlines: {0: {
      color: 'red',
      lineWidth: 1,
      opacity: 0.5
    }}
  });
  panel.add(timeSeriesChart);

  // 2. Wind Speed Distribution
  var histogramChart = ui.Chart.image.histogram({
    image: meanWind,
    region: sudan,
    scale: 11000,
    maxBuckets: 30
  })
  .setOptions({
    title: 'Wind Speed Distribution',
    hAxis: {
      title: 'Wind Speed (m/s)',
      gridlines: {count: 10}
    },
    vAxis: {
      title: 'Frequency',
      gridlines: {count: 6}
    },
    legend: {position: 'none'},
    colors: ['#1b9e77']
  });
  panel.add(histogramChart);

  // 3. Fixed Wind Speed vs Elevation
  var windElevChart = ui.Chart.feature.byFeature({
    features: sampledData,
    xProperty: 'elevation',
    yProperties: ['Wind_f_tavg']
  })
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Wind Speed vs Elevation',
    hAxis: {
      title: 'Elevation (m)',
      gridlines: {count: 8}
    },
    vAxis: {
      title: 'Wind Speed (m/s)',
      gridlines: {count: 6}
    },
    pointSize: 3,
    colors: ['#1b9e77'],
    trendlines: {
      0: {
        color: 'red',
        lineWidth: 1,
        opacity: 0.5,
        showR2: true
      }
    }
  });
  panel.add(windElevChart);

  // 4. Monthly Wind Speed Box Plot
  var boxPlotChart = ui.Chart.feature.byFeature({
    features: monthlyStats,
    xProperty: 'month',
    yProperties: ['p10', 'wind_speed', 'p90']
  })
  .setChartType('CandlestickChart')
  .setOptions({
    title: 'Monthly Wind Speed Variation',
    vAxis: {
      title: 'Wind Speed (m/s)',
      gridlines: {count: 8}
    },
    hAxis: {
      title: 'Month',
      gridlines: {count: 12}
    },
    legend: {position: 'none'},
    candlestick: {
      fallingColor: {strokeWidth: 0, fill: '#a50f15'},
      risingColor: {strokeWidth: 0, fill: '#1b9e77'}
    }
  });
  panel.add(boxPlotChart);

  return panel;
}

// Visualization parameters
var visualizationParams = {
  windSpeed: {
    min: 0.3750263580093698,
    max: 8.113219716238905,
    palette: ['#0e0e0e','#281dc8','#38913b','#5af7ff','#10ff22','#f5ff62','#ff640a']
  }
};

// Create legend
function createLegend() {
  var legend = ui.Panel({
    style: {
      padding: '8px 15px',
      position: 'bottom-left',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      width: '220px'
    }
  });

  // Add legend title
  var legendTitle = ui.Label({
    value: 'Wind Speed (m/s)',
    style: {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 10px 0',
      padding: '0'
    }
  });
  legend.add(legendTitle);

  // Define legend values and colors
  var palette = visualizationParams.windSpeed.palette;
  var min = visualizationParams.windSpeed.min;
  var max = visualizationParams.windSpeed.max;
  var steps = palette.length;
  var step = (max - min) / (steps - 1);

  // Create legend items
  palette.forEach(function(color, i) {
    var value = min + (step * i);
    
    var item = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {
        margin: '0 0 6px 0',
        padding: '0'
      }
    });

    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        padding: '8px',
        margin: '0 6px 0 0',
        border: '1px solid #999'
      }
    });

    var valueLabel = ui.Label({
      value: value.toFixed(2) + (i < steps-1 ? ' - ' + (value + step).toFixed(2) : '+'),
      style: {
        margin: '0',
        padding: '4px 0',
        fontSize: '14px'
      }
    });

    item.add(colorBox);
    item.add(valueLabel);
    legend.add(item);
  });

  // Add source information
  var sourceLabel = ui.Label({
    value: 'Source: FLDAS/NOAH01',
    style: {
      fontSize: '11px',
      margin: '10px 0 0 0',
      color: '#666'
    }
  });
  legend.add(sourceLabel);

  return legend;
}

// Initialize map
Map.centerObject(sudan, 5);
Map.addLayer(meanWind, visualizationParams.windSpeed, 'Mean Wind Speed');

// Add charts panel
Map.add(createCharts());

// Add legend
Map.add(createLegend());

// Export options
Export.table.toDrive({
  collection: monthlyStats,
  description: 'Sudan_Wind_Statistics',
  fileFormat: 'CSV'
});

// Export sampled wind-elevation data
Export.table.toDrive({
  collection: sampledData,
  description: 'Sudan_Wind_Elevation_Correlation',
  fileFormat: 'CSV'
});