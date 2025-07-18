const StationsToCheck = [
  {
    crs: 'KGX',
    name: "King's Cross",
    lat: 51.53111,
    lon: -0.123,
    tocFilter: null,
    timeWindow: 400,
  },
  {
    crs: 'STP',
    name: 'St Pancras',
    lat: 51.53336,
    lon: -0.12746,
    tocFilter: null,
    timeWindow: 180,
  },
  {
    crs: 'PAD',
    name: 'Paddington',
    lat: 51.51716,
    lon: -0.17752,
    tocFilter: 'GW',
    timeWindow: 360,
  },
  {
    crs: 'LBG',
    name: 'London Bridge',
    lat: 51.50368,
    lon: -0.0839,
    tocFilter: null,
    timeWindow: 90,
  },
  {
    crs: 'WAT',
    name: 'Waterloo',
    lat: 51.50232,
    lon: -0.11376,
    tocFilter: null,
    timeWindow: 180,
  },
  {
    crs: 'LST',
    name: 'Liverpool Street',
    lat: 51.51864,
    lon: -0.081,
    // Cannot filter by more than one TOC, so the Overground can be irrelevant
    tocFilter: 'LE',
    timeWindow: 180,
  },
  {
    crs: 'EUS',
    name: 'Euston',
    lat: 51.52877,
    lon: -0.1337,
    tocFilter: null,
    timeWindow: 240,
  },
  {
    crs: 'VIC',
    name: 'Victoria',
    lat: 51.49464,
    lon: -0.14478,
    tocFilter: null,
    timeWindow: 180,
  },
  {
    crs: 'MYB',
    name: 'Marylebone',
    lat: 51.52304,
    lon: -0.16291,
    tocFilter: null,
    timeWindow: 480,
  },
  {
    crs: 'CHX',
    name: 'Charing Cross',
    lat: 51.50798,
    lon: -0.12481,
    tocFilter: null,
    timeWindow: 360,
  },
  {
    crs: 'FEN',
    name: 'Fenchurch Street',
    lat: 51.51131,
    lon: -0.07732,
    tocFilter: null,
    timeWindow: 600,
  },
  {
    crs: 'CST',
    name: 'Cannon Street',
    lat: 51.51072,
    lon: -0.0906,
    tocFilter: null,
    timeWindow: 300,
  },
  {
    crs: 'BFR',
    name: 'Blackfriars',
    lat: 51.50965,
    lon: -0.10322,
    tocFilter: null,
    timeWindow: 260,
  },
  {
    crs: 'CTK',
    name: 'City Thameslink',
    lat: 51.51405,
    lon: -0.10348,
    tocFilter: null,
    timeWindow: 260,
  },
  {
    crs: 'MOG',
    name: 'Moorgate',
    lat: 51.5185,
    lon: -0.08841,
    tocFilter: null,
    timeWindow: 480,
  },
  {
    crs: 'WAE',
    name: 'Waterloo East',
    lat: 51.50428,
    lon: -0.108,
    tocFilter: null,
    timeWindow: 180,
  },
  {
    crs: 'EPH',
    name: 'Elephant & Castle',
    lat: 51.49405,
    lon: -0.09869,
    tocFilter: null,
    timeWindow: 300,
  },
]

async function getStationsState(env) {
  const apiKey = env.RDM_LDBSVWS_GetDepBoardWithDetails_API_KEY

  const promises = StationsToCheck.map(s =>
    (async () => {
      try {
        const now = new Date(Date.now() - s.timeWindow * 60 * 1000)
        const londonTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).formatToParts(now)
        const nowStr = `${londonTime.find(p => p.type === 'year')?.value}${londonTime.find(p => p.type === 'month')?.value}${londonTime.find(p => p.type === 'day')?.value}T${londonTime.find(p => p.type === 'hour')?.value}${londonTime.find(p => p.type === 'minute')?.value}${londonTime.find(p => p.type === 'second')?.value}`

        console.log(`Fetching data for ${s.crs} at ${nowStr}...`)

        const query = new URLSearchParams({
          numRows: '149',
          timeWindow: s.timeWindow.toString(),
          services: 'P',
        })
        if (s.tocFilter) {
          query.append('filterTOC', s.tocFilter)
        }

        const resp = await fetch(
          `https://api1.raildata.org.uk/1010-live-departure-board---staff-version1_0/LDBSVWS/api/20220120/GetDepartureBoardByCRS/${s.crs}/${nowStr}?${query}`,
          {
            cf: {
              cacheTtl: 60,
              cacheEverything: true,
            },
            headers: {
              'x-apikey': apiKey,
            },
          },
        )
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`)
        }

        const data = await resp.json()
        const services = data?.trainServices || []
        console.log(`Fetched ${services.length} services for ${s.crs} at ${nowStr}`)

        const meaningfulServices = services.filter(svc => !svc.isCancelled)
        const platformedServices = meaningfulServices.filter(svc => !!svc.platform)
        const platformedPercentage =
          meaningfulServices.length > 0 ? Math.round((platformedServices.length * 100) / meaningfulServices.length) : null

        return {
          ...s,
          platformedPercentage,
        }
      } catch (e) {
        console.error(`Failed to fetch data for ${s.crs}:`, e)
        return {
          ...s,
          platformedPercentage: null,
        }
      }
    })(),
  )

  const results = await Promise.all(promises)

  return results
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/api/stations-state') {
      const stationsState = await getStationsState(env)
      return new Response(JSON.stringify({ stations: stationsState }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        },
      })
    }

    return env.ASSETS.fetch(request)
  },
}
