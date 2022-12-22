async function getData(url) {
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

async function loadCountriesData() {
    const countries = await getData('https://restcountries.com/v3.1/all?fields=name&fields=cca3&fields=area');
    return countries.reduce((result, country) => {
        result[country.cca3] = country;
        return result;
    }, {});
}

class MockApi {
    async init(url) {
        const countries = await getData(url);
        this._borders = {};

        for (const { cca3, borders } of countries) {
            this._borders[cca3] = borders;
        }
    }

    async getBorders(code) {
        return this._borders[code];
    }
}

// Функция для прямого запроса данных по каждой стране
async function getBordersFromApi(code) {
    const data = await getData(`https://restcountries.com/v3.1/alpha/${code}?fields=borders`);
    return data.borders;
}

async function getBordersForAll(codes, getBorders) {
    const bordersArray = await Promise.all(codes.map(getBorders));
    const bordersMap = {};

    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        const borders = bordersArray[i];
        bordersMap[code] = borders;
    }

    return bordersMap;
}

async function calculateRoute(fromCode, toCode, getBorders) {
    function getNewRoutes(routes, bordersMap, visitedCountries) {
        const newRoutes = [];
        let isDone = false;

        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            const code = route[route.length - 1];
            const borders = bordersMap[code].filter((border) => !visitedCountries.has(border));

            if (borders.includes(toCode)) {
                isDone = true;
            }

            borders.forEach((border) => {
                newRoutes.push([...route, border]);
            });
        }

        return [newRoutes, isDone];
    }

    let queriesCount = 0;
    const visitedCountries = new Set([fromCode]);
    let routes = [[fromCode]];
    let isDone = false;

    while (!isDone && routes.length) {
        const codes = routes.map((route) => route[route.length - 1]);
        const codesToCheck = [...new Set(codes)];
        codesToCheck.forEach((code) => visitedCountries.add(code));
        queriesCount += codesToCheck.length;

        let bordersMap;

        try {
            // eslint-disable-next-line no-await-in-loop
            bordersMap = await getBordersForAll(codesToCheck, getBorders);
        } catch {
            return {
                hasError: true,
                queriesCount,
                routes: [],
            };
        }

        [routes, isDone] = getNewRoutes(routes, bordersMap, visitedCountries);
    }

    routes = routes.filter((route) => route[route.length - 1] === toCode);

    return {
        hasError: false,
        queriesCount,
        routes,
    };
}

function getCodeByCountryName(name, countriesData) {
    for (const code in countriesData) {
        if (countriesData[code].name.common === name) {
            return code;
        }
    }
    return null;
}

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const output = document.getElementById('output');
const requestMode = document.getElementById('request-mode');

function blockForm() {
    fromCountry.disabled = true;
    toCountry.disabled = true;
    submit.disabled = true;
}

function unblockForm() {
    fromCountry.disabled = false;
    toCountry.disabled = false;
    submit.disabled = false;
}

function addStringToOutput(string) {
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
        console.log('Calculation started...');

        const fromName = fromCountry.value;
        const toName = toCountry.value;
        const mode = requestMode.value;

        if (!fromName || !toName || fromName === toName) {
            return;
        }

        blockForm();
        output.textContent = `Calculating route from ${fromName} to ${toName}...`;

        let getBorders;

        if (mode === 'Every request goes to API') {
            getBorders = getBordersFromApi;
        } else {
            const mockApi = new MockApi();
            await mockApi.init('https://restcountries.com/v3.1/all?fields=cca3&fields=borders');
            getBorders = mockApi.getBorders.bind(mockApi);
        }

        const fromCode = getCodeByCountryName(fromName, countriesData);
        const toCode = getCodeByCountryName(toName, countriesData);
        const { hasError, queriesCount, routes } = await calculateRoute(fromCode, toCode, getBorders);

        output.textContent = '';

        if (hasError) {
            addStringToOutput('Error on request. May be too far away? ┗|｀O′|┛');
        } else if (!routes.length) {
            addStringToOutput('No such routes ⚆_⚆');
        } else {
            routes.forEach((route) => {
                const message = `${route.map((code) => countriesData[code].name.common).join(' → ')} (${
                    route.length - 1
                } borders)`;
                addStringToOutput(message);
            });
        }

        addStringToOutput(`Done in ${queriesCount} requests`);

        console.timeEnd('Calculation done in ');

        unblockForm();
    });
})();
