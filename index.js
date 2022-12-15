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

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const output = document.getElementById('output');

async function getBorders(code) {
    const data = await getData(`https://restcountries.com/v3.1/alpha/${code}?fields=borders`);
    return data.borders;
}

async function getBordersForAll(...codes) {
    return Promise.all(codes.map(getBorders));
}

async function calculateRoute(fromCode, toCode) {
    function getNewRoutes(routes, bordersArray, visitedCountries) {
        const newRoutes = [];
        let isDone = false;

        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            const borders = bordersArray[i].filter((border) => !visitedCountries.has(border));

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
        const codesToCheck = routes.map((route) => route[route.length - 1]);
        codesToCheck.forEach((code) => visitedCountries.add(code));
        queriesCount += codesToCheck.length;

        let bordersArray;

        try {
            // eslint-disable-next-line no-await-in-loop
            bordersArray = await getBordersForAll(...codesToCheck);
        } catch {
            return {
                hasError: true,
                queriesCount,
                routes: [],
            };
        }

        [routes, isDone] = getNewRoutes(routes, bordersArray, visitedCountries);
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

        const fromName = fromCountry.value;
        const toName = toCountry.value;

        if (!fromName || !toName || fromName === toName) {
            return;
        }

        blockForm();
        output.textContent = `Calculating route from ${fromName} to ${toName}...`;

        const fromCode = getCodeByCountryName(fromName, countriesData);
        const toCode = getCodeByCountryName(toName, countriesData);
        const { hasError, queriesCount, routes } = await calculateRoute(fromCode, toCode);

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

        unblockForm();
    });
})();
