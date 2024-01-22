require("dotenv").config();

const express = require("express");
const openai = require("openai");
const process = require("process");
const fs = require("fs");

var app = express();

const PORT = process.env.PORT || 8000;

var openaiConfig = new openai.Configuration({
    apiKey: process.env.OPENAI_API_KEY
});

var openaiApi = new openai.OpenAIApi(openaiConfig);
var storedData = {};

app.use(express.json());

if (fs.existsSync("data.json")) {
    try {
        storedData = JSON.parse(fs.readFileSync("data.json", "utf-8"));
    } catch (e) {
        console.warn("Unable to retrieve stored data:", e);
    }
}

function saveStoredData() {
    fs.writeFileSync("data.json", JSON.stringify(storedData));
}

function getTokenCount(prompt) {
    return Math.ceil(prompt.trim().replace(/\s/g, "").length / 4);
}

function deductTokens(user, amount) {
    var overspent = false;

    storedData.tokens ||= {};

    storedData.tokens[user] ||= 0;
    storedData.tokens[user] -= amount;

    if (storedData.tokens[user] < 0) {
        storedData.tokens[user] = 0;
        overspent = true;
    }

    saveStoredData();

    return !overspent;
}
http://localhost:8000/api/admin/data?key=james&adminKey=test&tokens=10
app.post("/api/complete", function(request, response) {
    if (typeof(request.body.prompt) != "string" || request.body.prompt.trim() == "") {
        response.status(400);
        response.json({
            status: "error",
            message: "No prompt was included"
        });

        return;
    }

    var tokenCount = getTokenCount(request.body.prompt);

    if (!storedData.tokens?.hasOwnProperty(request.query.key)) {
        response.status(400);
        response.json({
            status: "error",
            message: "User not found"
        });
    }

    if (!deductTokens(request.query.key, tokenCount)) {
        response.status(429);
        response.json({
            status: "error",
            message: "Out of tokens; please ask one of our mentors for more"
        });

        return;
    }

    var temperature = request.query.temperature ? Number(request.query.temperature) : 0.7;

    if (Number.isNaN(temperature) || temperature < 0 || temperature > 1) {
        response.status(400);
        response.json({
            status: "error",
            message: "Temperature must be a number between 0 and 1 inclusive"
        });

        return;
    }

    openaiApi.createCompletion({
        model: process.env.MODEL || "gpt-3.5-turbo-instruct",
        prompt: request.body.prompt,
        max_tokens: 256,
        temperature,
        stop: [request.query.stop ?? "\n"]
    }).then(function(completion) {
        var result = completion.data.choices[0].text;

        response.json({
            status: "ok",
            completion: result
        });

        deductTokens(request.query.key, getTokenCount(result));
    }).catch(function(error) {
        console.error("OpenAI error:", error.response);

        response.status(500);
        response.json({
            status: "error",
            message: "Unable to obtain completion"
        });
    });
});

app.get("/api/balance", function(request, response) {
    if (!storedData.tokens?.hasOwnProperty(request.query.key)) {
        response.status(400);
        response.json({
            status: "error",
            message: "User not found"
        });
    }

    response.status(200);
    response.json({
        status: "ok",
        tokens: storedData.tokens[request.query.key]
    });
});

app.get("/api/admin/data", function(request, response) {
    if (request.query.adminKey != process.env.ADMIN_KEY) {
        response.status(403);
        response.json({
            status: "error",
            message: "The admin key provided is incorrect"
        });

        return;
    }

    response.status(200);
    response.json({
        status: "ok",
        data: storedData
    });
});

app.get("/api/admin/setbalance", function(request, response) {
    if (request.query.adminKey != process.env.ADMIN_KEY) {
        response.status(403);
        response.json({
            status: "error",
            message: "The admin key provided is incorrect"
        });

        return;
    }

    if (typeof(request.query.key) != "string" || request.query.key == "") {
        response.status(400);
        response.json({
            status: "error",
            message: "No key specified"
        });

        return;
    }

    var tokensString = request.query.tokens || "";
    var adding = false;

    if (tokensString.startsWith("a")) {
        adding = true;
        tokensString = tokensString.substring(1);
    }

    var tokens = Number(tokensString);

    if (Number.isNaN(tokens) || !Number.isInteger(tokens)) {
        response.status(400);
        response.json({
            status: "error",
            message: "Token count must be an integer"
        });

        return;
    }

    if (tokens < 0) {
        adding = true;
    }

    storedData.tokens ||= {};
    storedData.givenTokens ||= {};

    if (!adding) {
        storedData.tokens[request.query.key] = 0;
    }

    storedData.tokens[request.query.key] ||= 0;
    storedData.tokens[request.query.key] += tokens;

    storedData.givenTokens[request.query.key] ||= 0;
    storedData.givenTokens[request.query.key] += tokens;

    saveStoredData();

    response.status(200);
    response.json({status: "ok"});
});

app.use(function(request, response, next) {
    response.status(404);
    response.send({
        status: "error",
        message: "Invalid endpoint (check the URL)"
    });
});

app.listen(PORT, function() {
    console.log(`Server running on port ${PORT}`);
    console.log("Admin key:", process.env.ADMIN_KEY);
});