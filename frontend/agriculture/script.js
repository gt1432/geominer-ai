console.log("THIS IS MY SCRIPT");
const API_KEY = "80a09e21dad3d9284a10a028a31171bf";

const cropInfo = {

    rice: {
        description: "Requires high rainfall and warm temperatures.",
        market: "High",
        season: "Kharif"
    },

    coffee: {
        description: "Grows best in tropical climates with moderate rainfall.",
        market: "Very High",
        season: "Perennial"
    },

    chickpea: {
        description: "Thrives in cool climates with low rainfall.",
        market: "High",
        season: "Rabi"
    },

    jute: {
        description: "Needs warm humid climate and alluvial soil.",
        market: "Medium",
        season: "Kharif"
    },

    mothbeans: {
        description: "Drought resistant crop suitable for dry regions.",
        market: "Medium",
        season: "Kharif"
    },

    maize: {
        description: "Requires fertile soil and moderate rainfall.",
        market: "High",
        season: "Kharif/Rabi"
    },

    cotton: {
        description: "Needs warm weather and black soil.",
        market: "High",
        season: "Kharif"
    }
};

let map = L.map('map').setView([20.5937, 78.9629], 5);

L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '© OpenStreetMap contributors'
    }
).addTo(map);

let marker = null;

function setSoilType() {

    const soil =
        document.getElementById("soilType").value;

    if (soil === "alluvial") {

        document.getElementById("n").value = 80;
        document.getElementById("p").value = 40;
        document.getElementById("k").value = 40;
        document.getElementById("ph").value = 6.8;
    }

    else if (soil === "black") {

        document.getElementById("n").value = 50;
        document.getElementById("p").value = 30;
        document.getElementById("k").value = 70;
        document.getElementById("ph").value = 7.5;
    }

    else if (soil === "red") {

        document.getElementById("n").value = 40;
        document.getElementById("p").value = 20;
        document.getElementById("k").value = 30;
        document.getElementById("ph").value = 6.0;
    }

    else if (soil === "laterite") {

        document.getElementById("n").value = 25;
        document.getElementById("p").value = 15;
        document.getElementById("k").value = 25;
        document.getElementById("ph").value = 5.5;
    }

else if (soil === "peat") {

    document.getElementById("n").value = 70;
    document.getElementById("p").value = 35;
    document.getElementById("k").value = 30;
    document.getElementById("ph").value = 5.2;
}

else if (soil === "yellow") {

    document.getElementById("n").value = 45;
    document.getElementById("p").value = 25;
    document.getElementById("k").value = 35;
    document.getElementById("ph").value = 6.2;
}

else if (soil === "cinder") {

    document.getElementById("n").value = 30;
    document.getElementById("p").value = 20;
    document.getElementById("k").value = 25;
    document.getElementById("ph").value = 6.5;
}
}
map.on('click', async function (e) {

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (marker) {
        map.removeLayer(marker);
    }

    marker = L.marker([lat, lng]).addTo(map);

    document.getElementById("coords").innerHTML =
        `Latitude: ${lat.toFixed(4)}
         | Longitude: ${lng.toFixed(4)}
         <br>Loading weather...`;

    try {

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
        );

        const weather =
            await response.json();
        console.log(weather);

        document.getElementById("temp").value =
            weather.main.temp;

        document.getElementById("humidity").value =
            weather.main.humidity;

        const estimatedRainfall = {

            "Dhāri": 800,
            "Hyderabad": 900,
            "Visakhapatnam": 1200,
            "Chennai": 1400,
            "Mumbai": 2200,
            "Bengaluru": 970
};

        document.getElementById("rainfall").value =
            estimatedRainfall[weather.name] || 1000;

        document.getElementById("coords").innerHTML = `
            <b>${weather.name || "Selected Location"}</b><br>
            Latitude: ${lat.toFixed(4)}
            | Longitude: ${lng.toFixed(4)}<br>
            Temperature: ${weather.main.temp} °C<br>
            Humidity: ${weather.main.humidity}%<br>
            Weather: ${weather.weather[0].description}
        `;

    } catch (error) {

        console.error(error);

        document.getElementById("coords").innerHTML =
            "Weather fetch failed";
    }
});

async function predictCrop() {

    try {

        const data = {

            N: parseFloat(
                document.getElementById("n").value
            ),

            P: parseFloat(
                document.getElementById("p").value
            ),

            K: parseFloat(
                document.getElementById("k").value
            ),

            temperature: parseFloat(
                document.getElementById("temp").value
            ),

            humidity: parseFloat(
                document.getElementById("humidity").value
            ),

            ph: parseFloat(
                document.getElementById("ph").value
            ),

            rainfall: parseFloat(
                document.getElementById("rainfall").value
            )
        };

        const response = await fetch(
    "http://192.168.0.105:5000/predict",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify(data)
            }
        );

        const result =
            await response.json();

        const cropName =
            result.best_crop.crop.toLowerCase();

        const info =
            cropInfo[cropName];

        const cropImage =
            `assets/crops/${cropName}.jpg`;

        document.getElementById("result").innerHTML = `

        <div class="prediction-card">

    <div class="crop-header">

        <img
            class="crop-image"
            src="${cropImage}"
            alt="${result.best_crop.crop}">

        <div class="crop-main">

            <h2>
                Recommended Crop
            </h2>

            <h1>
                ${result.best_crop.crop}
            </h1>

            <h3>
                Confidence:
                ${result.best_crop.confidence}%
            </h3>

        </div>

    </div>

            <hr>

            <h3>
                Top 3 Recommendations
            </h3>

            <ol>

                <li>
                    ${result.top3[0].crop}
                    (${result.top3[0].confidence}%)
                </li>

                <li>
                    ${result.top3[1].crop}
                    (${result.top3[1].confidence}%)
                </li>

                <li>
                    ${result.top3[2].crop}
                    (${result.top3[2].confidence}%)
                </li>

            </ol>

            <hr>

            <h3>
                Crop Information
            </h3>

            <p>
                <b>Description:</b>
                ${info ? info.description : "Information unavailable"}
            </p>

            <p>
                <b>Market Demand:</b>
                ${info ? info.market : "-"}
            </p>

            <p>
                <b>Growing Season:</b>
                ${info ? info.season : "-"}
            </p>

        </div>
        `;

    }

    catch (error) {

        console.error(error);

        document.getElementById("result").innerHTML =
            "Prediction failed";
    }
}
function handleSoilImage(event) {
        alert("handleSoilImage called");
        const file =
            event.target.files[0];
document.getElementById("soilResult").innerHTML =
    "Analyzing soil image...";
        if (!file) return;

        const preview =
            document.getElementById("preview");

        preview.src =
            URL.createObjectURL(file);

        preview.style.display =
            "block";
            const formData = new FormData();

formData.append(
    "image",
    file
);


fetch(
    "http://192.168.0.105:5001/predict-soil",
    {
        method: "POST",
        body: formData
    }
)
.then(response => response.json())
.then(data => {

   document.getElementById(
    "soilResult"
).innerHTML = `

<div class="soil-card">

     <b>AI Detected Soil</b>

    <h2>${data.soil}</h2>

    <p>
        Confidence:
        ${data.confidence}%
    </p>

</div>

`;

    if (data.soil === "Black Soil") {

        document.getElementById(
            "soilType"
        ).value = "black";

        setSoilType();
        predictCrop();
    }

    else if (data.soil === "Laterite Soil") {

        document.getElementById(
            "soilType"
        ).value = "laterite";

        setSoilType();
        predictCrop();
    }

    else if (
        data.soil === "Yellow Soil"
    ) {

        document.getElementById(
            "soilType"
        ).value = "yellow";

        setSoilType();
        predictCrop();
    }

    else if (
        data.soil === "Peat Soil"
    ) {

        document.getElementById(
            "soilType"
        ).value = "peat";

        setSoilType();
        predictCrop();
    }

    else if (
        data.soil === "Cinder Soil"
    ) {

        document.getElementById(
            "soilType"
        ).value = "cinder";

        setSoilType();
        predictCrop();
    }

})
.catch(error => {

    console.error(error);

    document.getElementById(
        "soilResult"
    ).innerHTML =
        "Soil detection failed";

});

}
document
    .getElementById("galleryInput")
    .addEventListener("change", handleSoilImage);

document
    .getElementById("cameraInput")
    .addEventListener("change", handleSoilImage);
alert("script loaded");