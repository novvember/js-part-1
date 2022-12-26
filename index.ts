/* eslint-disable no-await-in-loop */

type Code = string;

interface CountryData {
  cca3: Code;
  borders: Code[];
  name: {
    common: string;
  };
  area: number;
}

interface BordersMap {
  [K: Code]: Code[];
}

type GetBorders = (code: Code) => Promise<Code[]>;

interface CalculatedRoute {
  hasError: boolean;
  queriesCount: number;
  routes: Code[][];
}

async function getData<T>(url: string): Promise<T> {
  // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    redirect: 'follow',
  });
  return response.json();
}

async function loadCountriesData(): Promise<Record<Code, CountryData>> {
  const countries = await getData<CountryData[]>(
    'https://restcountries.com/v3.1/all?fields=name&fields=cca3&fields=area',
  );
  return countries.reduce((result, country) => {
    result[country.cca3] = country;
    return result;
  }, {} as Record<Code, CountryData>);
}

class MockApi {
  private _borders: BordersMap;

  constructor() {
    this._borders = {};
  }

  async init(url: string): Promise<void> {
    const countries = await getData<CountryData[]>(url);
    this._borders = {};

    for (const { cca3, borders } of countries) {
      this._borders[cca3] = borders;
    }
  }

  getBorders: GetBorders = async (code) => {
    return this._borders[code];
  };
}

// Функция для прямого запроса данных по каждой стране

const getBordersFromApi: GetBorders = async (code) => {
  const data = await getData<CountryData>(
    `https://restcountries.com/v3.1/alpha/${code}?fields=borders`,
  );
  return data.borders;
};

async function getBordersForAll(
  codes: Code[],
  getBorders: GetBorders,
): Promise<BordersMap> {
  const bordersArray: Code[][] = await Promise.all(codes.map(getBorders));
  const bordersMap: BordersMap = {};

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const borders = bordersArray[i];
    bordersMap[code] = borders;
  }

  return bordersMap;
}

async function calculateRoute(
  fromCode: Code,
  toCode: Code,
  getBorders: GetBorders,
): Promise<CalculatedRoute> {
  type Route = Code[];
  type Visited = Set<Code>;

  async function step(
    routes: Route[],
    visited: Visited,
    queriesCount: number,
    getBorders: GetBorders,
  ): Promise<[Route[], number]> {
    const codes = routes.map((route) => route[route.length - 1]);
    const codesToCheck = [...new Set(codes)];
    codesToCheck.forEach((code) => visited.add(code));
    queriesCount += codesToCheck.length;

    const bordersMap = await getBordersForAll(codesToCheck, getBorders);

    const newRoutes: Route[] = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const code = route[route.length - 1];
      const borders = bordersMap[code].filter((border) => !visited.has(border));
      borders.forEach((border) => {
        newRoutes.push([...route, border]);
      });
    }

    return [newRoutes, queriesCount];
  }

  function findCommon(routesForward: Route[], routesBackward: Route[]): Code[] {
    const codesForward = routesForward.map((route) => route[route.length - 1]);
    const codesBackward = routesBackward.map(
      (route) => route[route.length - 1],
    );
    const common: Code[] = [];
    codesForward.forEach((code) => {
      if (codesBackward.includes(code)) {
        common.push(code);
      }
    });
    return common;
  }

  function combineRoutes(
    routesForward: Route[],
    routesBackward: Route[],
  ): Route[] {
    const common = findCommon(routesForward, routesBackward);
    routesForward = routesForward.filter((route) =>
      common.includes(route[route.length - 1]),
    );
    routesBackward = routesBackward.filter((route) =>
      common.includes(route[route.length - 1]),
    );

    const routes: Route[] = [];

    for (const routeForward of routesForward) {
      for (const routeBackward of routesBackward) {
        if (
          routeForward[routeForward.length - 1] ===
          routeBackward[routeBackward.length - 1]
        ) {
          routes.push([
            ...routeForward.slice(0, -1),
            ...routeBackward.reverse(),
          ]);
        }
      }
    }

    return routes;
  }

  let queriesCount = 0;

  const visitedForward: Visited = new Set([fromCode]);
  const visitedBackward: Visited = new Set([toCode]);

  let routesForward: Route[] = [[fromCode]];
  let routesBackward: Route[] = [[toCode]];

  let isDone = false;
  let isForwardMode = true;

  while (!isDone && routesForward.length && routesBackward.length) {
    try {
      if (isForwardMode && routesForward.length) {
        [routesForward, queriesCount] = await step(
          routesForward,
          visitedForward,
          queriesCount,
          getBorders,
        );
      } else if (routesBackward.length) {
        [routesBackward, queriesCount] = await step(
          routesBackward,
          visitedBackward,
          queriesCount,
          getBorders,
        );
      }
    } catch {
      return {
        hasError: true,
        queriesCount,
        routes: [],
      };
    }

    isDone = findCommon(routesForward, routesBackward).length > 0;
    isForwardMode = !isForwardMode;
  }

  const routes = combineRoutes(routesForward, routesBackward);

  return {
    hasError: false,
    queriesCount,
    routes,
  };
}

function getCodeByCountryName(
  name: string,
  countriesData: Record<Code, CountryData>,
): Code | null {
  for (const code in countriesData) {
    if (countriesData[code].name.common === name) {
      return code;
    }
  }
  return null;
}

const form = document.getElementById('form') as HTMLFormElement;
const fromCountry = document.getElementById('fromCountry') as HTMLInputElement;
const toCountry = document.getElementById('toCountry') as HTMLInputElement;
const countriesList = document.getElementById('countriesList') as HTMLElement;
const submit = document.getElementById('submit') as HTMLButtonElement;
const output = document.getElementById('output') as HTMLElement;
const requestMode = document.getElementById(
  'request-mode',
) as HTMLSelectElement;

function blockForm(): void {
  fromCountry.disabled = true;
  toCountry.disabled = true;
  submit.disabled = true;
}

function unblockForm(): void {
  fromCountry.disabled = false;
  toCountry.disabled = false;
  submit.disabled = false;
}

function addStringToOutput(string: string): void {
  const info = document.createElement('p');
  info.textContent = string;
  output.append(info);
}

(async () => {
  blockForm();

  output.textContent = 'Loading…';
  const countriesData = await loadCountriesData();
  output.textContent = '';

  // Заполняем список стран для подсказки в инпутах
  Object.keys(countriesData)
    .sort((a, b) => countriesData[b].area - countriesData[a].area)
    .forEach((code) => {
      const option = document.createElement('option');
      option.value = countriesData[code].name.common;
      countriesList.appendChild(option);
    });

  unblockForm();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    console.time('Calculation done in ');

    const fromName = fromCountry.value as Code;
    const toName = toCountry.value as Code;
    const mode = requestMode.value;

    if (!fromName || !toName || fromName === toName) {
      return;
    }

    blockForm();
    output.textContent = `Calculating route from ${fromName} to ${toName}...`;

    let getBorders: GetBorders;

    if (mode === 'Every request goes to API') {
      getBorders = getBordersFromApi;
    } else {
      const mockApi = new MockApi();
      await mockApi.init(
        'https://restcountries.com/v3.1/all?fields=cca3&fields=borders',
      );
      getBorders = mockApi.getBorders.bind(mockApi);
    }

    const fromCode = getCodeByCountryName(fromName, countriesData);
    const toCode = getCodeByCountryName(toName, countriesData);

    if (!fromCode || !toCode) return;

    const { hasError, queriesCount, routes } = await calculateRoute(
      fromCode,
      toCode,
      getBorders,
    );

    output.textContent = '';

    if (hasError) {
      addStringToOutput('Error on request. May be too far away? ┗|｀O′|┛');
    } else if (!routes.length) {
      addStringToOutput('No such routes ⚆_⚆');
    } else {
      routes.forEach((route) => {
        const message = `${route
          .map((code) => countriesData[code].name.common)
          .join(' → ')} (${route.length - 1} borders)`;
        addStringToOutput(message);
      });
    }

    addStringToOutput(`Done in ${queriesCount} requests`);

    console.timeEnd('Calculation done in ');

    unblockForm();
  });
})();
