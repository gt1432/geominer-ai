
const translations = {

    en: {
        heroTitle: "Smart Farming For A Better Future",
        heroDescription: "AgriSmart uses Artificial Intelligence, weather intelligence and soil analysis to help farmers make better crop decisions.",
        startBtn: "Start Prediction",
        agriHeading: "Why Agriculture Matters"
    },

    hi: {
        heroTitle: "बेहतर भविष्य के लिए स्मार्ट खेती",
        heroDescription: "AgriSmart किसानों को बेहतर फसल निर्णय लेने में मदद करता है।",
        startBtn: "भविष्यवाणी शुरू करें",
        agriHeading: "कृषि क्यों महत्वपूर्ण है"
    },

    te: {
        heroTitle: "మెరుగైన భవిష్యత్తు కోసం స్మార్ట్ వ్యవసాయం",
        heroDescription: "AgriSmart రైతులకు సరైన పంట ఎంపికలో సహాయపడుతుంది.",
        startBtn: "అంచనా ప్రారంభించండి",
        agriHeading: "వ్యవసాయం ఎందుకు ముఖ్యమైనది"
    }
};

function changeLanguage() {

    const lang =
        document.getElementById(
            "languageSwitcher"
        ).value;

    const heroTitle =
        document.getElementById(
            "heroTitle"
        );

    const heroDescription =
        document.getElementById(
            "heroDescription"
        );

    const startBtn =
        document.getElementById(
            "startBtn"
        );

    const agriHeading =
        document.getElementById(
            "agriHeading"
        );

    if (heroTitle) {
        heroTitle.innerText =
            translations[lang].heroTitle;
    }

    if (heroDescription) {
        heroDescription.innerText =
            translations[lang].heroDescription;
    }

    if (startBtn) {
        startBtn.innerText =
            translations[lang].startBtn;
    }

    if (agriHeading) {
        agriHeading.innerText =
            translations[lang].agriHeading;
    }
}

