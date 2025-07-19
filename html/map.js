let updateInterval = null
const darkMode = window.matchMedia('(prefers-color-scheme: dark)')

function getMapStyle() {
  return darkMode.matches ? '/map-styles/osm-dark-style.json' : '/map-styles/osm-bright-style.json'
}

const greenCutoffPct = 80
const yellowCutoffPct = 35

const checkImg = new Image()
checkImg.src = '/check.svg'
const warningImg = new Image()
warningImg.src = '/warning.svg'
const errorImg = new Image()
errorImg.src = '/error.svg'

const map = new maplibregl.Map({
  container: 'map',
  style: getMapStyle(),
  center: [0, 0],
  zoom: 12,
  interactive: false,
  attributionControl: false,
}).addControl(
  new maplibregl.AttributionControl({
    customAttribution: ['© OpenStreetMap contributors'],
  }),
)

darkMode.addEventListener('change', e => {
  map.setStyle(getMapStyle())

  // Reset the marker layers
  setUpUpdater()
})

function fitBounds() {
  map.fitBounds(
    [
      [-0.18, 51.5365],
      [-0.07, 51.49],
    ],
    {
      padding: {
        top: 30,
        bottom: 30,
        left: 30,
        right: 30,
      },
      animate: false,
    },
  )
}

map.once('load', fitBounds)
map.on('resize', fitBounds)

const mapContainer = document.getElementById('map')

document.addEventListener('resize', () => {
  map.resize()
})

const markers = {}

function createMarker() {
  const size = 125

  return {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 4),

    __platformPct: null,

    // get rendering context for the map canvas when layer is added to the map
    onAdd() {
      const canvas = document.createElement('canvas')
      canvas.width = this.width
      canvas.height = this.height
      this.context = canvas.getContext('2d')
    },

    // called once before every frame where the icon will be used
    render() {
      const duration = 3000
      const t = (performance.now() % duration) / duration

      const radius = (size / 2) * 0.3
      const outerRadius = (size / 2) * 0.7 * t + radius
      const context = this.context

      // draw outer circle
      context.clearRect(0, 0, this.width, this.height)
      context.beginPath()
      context.arc(this.width / 2, this.height / 2, outerRadius, 0, Math.PI * 2)

      if (this.__platformPct >= greenCutoffPct) {
        context.fillStyle = `rgba(10, 181, 10, ${1 - t})`
      } else if (this.__platformPct >= yellowCutoffPct) {
        context.fillStyle = `rgba(234, 139, 4, ${1 - t})`
      } else {
        context.fillStyle = `rgba(216, 34, 34, ${1 - t})`
      }
      context.fill()

      // draw inner circle
      context.beginPath()
      context.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2)
      if (this.__platformPct >= greenCutoffPct) {
        context.fillStyle = 'rgba(10, 181, 10, 1)'
      } else if (this.__platformPct >= yellowCutoffPct) {
        context.fillStyle = 'rgba(234, 139, 4, 1)'
      } else {
        context.fillStyle = 'rgba(216, 34, 34, 1)'
      }
      if (this.__platformPct >= greenCutoffPct) {
        context.strokeStyle = 'color-mix(in srgb, rgba(10, 181, 10, 1), black 20%)'
      } else if (this.__platformPct >= yellowCutoffPct) {
        context.strokeStyle = 'color-mix(in srgb, rgba(234, 139, 4, 1), black 20%)'
      } else {
        context.strokeStyle = 'color-mix(in srgb, rgba(216, 34, 34, 1), black 20%)'
      }
      context.lineWidth = 4
      context.fill()
      context.stroke()

      // add check/warning/error icons
      const iconSize = 42
      if (this.__platformPct >= greenCutoffPct) {
        context.drawImage(checkImg, (this.width - iconSize) / 2, (this.height - iconSize) / 2, iconSize, iconSize)
      } else if (this.__platformPct >= yellowCutoffPct) {
        context.drawImage(warningImg, (this.width - iconSize) / 2, (this.height - iconSize) / 2, iconSize, iconSize)
      } else {
        context.drawImage(errorImg, (this.width - iconSize) / 2, (this.height - iconSize) / 2, iconSize, iconSize)
      }

      // update this image's data with data from the canvas
      this.data = context.getImageData(0, 0, this.width, this.height).data

      // continuously repaint the map, resulting in the smooth animation of the dot
      map.triggerRepaint()

      // return `true` to let the map know that the image was updated
      return true
    },
  }
}

async function updatePlatformingData(abortController) {
  try {
    const resp = await fetch('/api/stations-state', { signal: abortController.signal })
    const data = await resp.json()

    if (abortController.signal.aborted) {
      console.warn('Update aborted, skipping processing of data')
      ac = null
      return
    }

    ac = null

    data.stations.forEach(stn => {
      const marker = markers[stn.crs]
      if (!marker) {
        const newMarker = createMarker()
        newMarker.__platformPct = stn.platformedPercentage
        markers[stn.crs] = newMarker

        map.addImage(`img-${stn.crs}`, newMarker, { pixelRatio: 2 })
        map.addSource(`source-${stn.crs}`, {
          type: 'geojson',
          tolerance: 0,
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  name: stn.name,
                },
                geometry: {
                  type: 'Point',
                  coordinates: [stn.lon, stn.lat],
                },
              },
            ],
          },
        })
        map.addLayer({
          id: `layer-${stn.crs}`,
          type: 'symbol',
          source: `source-${stn.crs}`,
          layout: {
            'icon-image': `img-${stn.crs}`,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
        })

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'station-popup',
        })

        map.on('mousemove', `layer-${stn.crs}`, e => {
          const stationCoordsPx = map.project(e.features[0].geometry.coordinates)
          const mousePoint = e.point
          const distance = Math.sqrt(Math.pow(stationCoordsPx.x - mousePoint.x, 2) + Math.pow(stationCoordsPx.y - mousePoint.y, 2))

          if (distance > 10.5) {
            popup.remove()
            return
          }

          const coordinates = e.features[0].geometry.coordinates.slice()
          const name = e.features[0].properties.name

          while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360
          }

          popup.setLngLat(coordinates).setHTML(name).addTo(map)
        })

        map.on('mouseleave', `layer-${stn.crs}`, () => {
          popup.remove()
        })
      } else {
        marker.__platformPct = stn.platformedPercentage
      }
    })
    document.querySelector('#map').classList.remove('loading')

    // Update table
    sortedStations = [...data.stations]

    // sort by low to high pct, then by name
    sortedStations.sort((a, b) => {
      if (a.platformedPercentage === b.platformedPercentage) {
        return a.name.localeCompare(b.name)
      }
      return a.platformedPercentage - b.platformedPercentage
    })

    const tableBody = document.querySelector('#stationList tbody')
    tableBody.innerHTML = ''
    sortedStations.forEach(stn => {
      const row = document.createElement('tr')
      if (stn.platformedPercentage >= greenCutoffPct) {
        row.classList.add('green')
      } else if (stn.platformedPercentage >= yellowCutoffPct) {
        row.classList.add('yellow')
      } else {
        row.classList.add('red')
      }

      row.innerHTML = `
        <td>${stn.name}</td>
        <td><span class="percentage">${stn.platformedPercentage || 0}%</span> of services (${stn.platformedServices || 0} of ${stn.totalServices || 0})</td>
      `
      tableBody.appendChild(row)
    })
  } catch (error) {
    console.error('Error fetching platforming data:', error)
  }
}

function setUpUpdater() {
  let ac = null
  function performUpdate() {
    if (ac) {
      ac.abort()
    }
    ac = new AbortController()
    updatePlatformingData(ac)
  }

  if (updateInterval) {
    clearInterval(updateInterval)
  }

  // Clear existing markers - https://github.com/mapbox/mapbox-gl-js/issues/4006
  Object.keys(markers).forEach(k => {
    map.removeLayer(`layer-${k}`)
    map.removeSource(`source-${k}`)
    map.removeImage(`img-${k}`)
    delete markers[k]
  })

  updateInterval = setInterval(performUpdate, 60000)
  performUpdate()
}

map.on('load', () => {
  console.log('Map loaded, setting up updater')

  setUpUpdater()
})
