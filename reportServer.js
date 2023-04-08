const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const mongoose = require('mongoose');
const AccessTimes = require("./models/accessTimes")
const EndpointAccess = require("./models/endpointAccess")
const Error = require("./models/Error")
const jwt = require("jsonwebtoken");
const userModel = require("./models/user.js");
const refreshTokenModel = require("./models/refreshToken.js");
const bcrypt = require("bcrypt");

const app = express();

app.use(express.json());
app.use(morgan(":method"));
app.use(cors({exposedHeaders: ['Authorization', 'auth-token-access', 'auth-token-refresh']}));

app.listen(3001, async () => {
    console.log("Server started on port 3001")
    await mongoose.connect('mongodb+srv://dbUser:dbUser1@cluster0.ha92a.mongodb.net/pokemon');
})

const authUser = async (req, res, next) => {
    let header = req.header("Authorization")
    if(header === undefined) {
        header = req.body['Authorization']
    }
    console.log(header)

    if(!header) {
        return res.status(400).json({"error": "No token found in header."});
    }

    const token = header.split(" ")
    if(token[0] != "Bearer" || token.length != 2) {
        return res.status(400).json({"message": "an access token needs to be provided in the request header."})
    }
    
    const accessToken = token[1];
    try {
        const verified = jwt.verify(accessToken, "assignmentaccess");
        next();
    } catch(err) {
        return res.status(400).json({"error": "Invalid token."});
    }
    
}

const authAdmin = async (req, res, next) => {
    const token = req.header('Authorization').split(" ")[1]
    const payload = jwt.verify(token, "assignmentaccess");

    if (payload?.user?.role == "admin") {
        return next();
    }

    return res.status(403).json({"error": "Access denied."});
}

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userWithHashedPassword = { username: username, password: hashedPassword };
        const user = await userModel.create(userWithHashedPassword);

        const existingAccessTime = await AccessTimes.findOne({"username": username})
        if(existingAccessTime == null) {
            await AccessTimes.insertMany({"username": username, "lastAccess": new Date()})
        } else {
            await AccessTimes.updateOne({"username": username}, {"lastAccess": new Date()})
        }

        return res.status(201).json({"user": user});
    } catch(err) {
        return res.status(500).json({"message": "An error occured.", "error": err})
    }
});

app.get('/requestNewAccessToken', async (req, res) => {
    const header = req.header('Authorization')
    if(!header) {
        return res.status(400).json({"error": "No token found in header."});
    }
    
    const token = req.header('Authorization').split(" ")
    if(token[0] != "Refresh" || token.length != 2) {
        return res.status(400).json({"message": "a refresh token needs to be provided in the request header."})
    }

    const refreshToken = token[1];
    const foundToken = await refreshTokenModel.findOne({"token": refreshToken});

    if (!foundToken) {
        return res.status(400).json({"message": "the provided refresh token could not be found."})
    }

    try {
        const payload = await jwt.verify(refreshToken, "assignmentrefresh")
        const accessToken = jwt.sign({ user: payload.user }, "assignmentaccess", { expiresIn: '10s' })
        res.header('auth-token-access', accessToken)
        return res.status(201).json({"message": "new token created"})
    } catch (error) {
        return res.status(400).json({"message": "invalid refresh token."})
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body

    if (!password || !username) {
        return res.status(400).json({"message": "please provide a username and password."})
    }

    const user = await userModel.findOne({ username })
    if (!user) {
        return res.status(404).json({"message": "username not found."})
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password)
    if (!isPasswordCorrect) {
        return res.status(400).json({"message": "incorrect password."})
    }

    const accessToken = jwt.sign({ user: user }, "assignmentaccess", { expiresIn: '10s' })
    const refreshToken = jwt.sign({ user: user }, "assignmentrefresh")
    await refreshTokenModel.deleteMany({"username": username});
    await refreshTokenModel.create({"token": refreshToken, "username": username});

    res.header('auth-token-access', accessToken)
    res.header('auth-token-refresh', refreshToken)

    const existingAccessTime = await AccessTimes.findOne({"username": user.username})
    if(existingAccessTime == null) {
        await AccessTimes.insertMany({"username": username, "lastAccess": new Date()})
    } else {
        await AccessTimes.updateOne({"username": username}, {"lastAccess": new Date()})
    }

    return res.status(200).json({"user": user})
})

app.post('/logout', async(req, res) => {
    const { username } = req.body
    await refreshTokenModel.deleteMany({"username": username});
    return res.status(200).json({"message": "Logged out."})
})

app.use(authUser)

app.post("/recordEndpointAccess", async (req, res) => {
    try {
        await EndpointAccess.insertMany({"username": req.body.username, "time": new Date(), "endpoint": req.body.endpoint})
        return res.status(200).json({"status": "OK"})
    } catch(error) {
        await Error.insertMany({"error": error._message, "time": new Date(), "endpoint": req.body.endpoint})
        return res.status(500).json({"error": error})
    }
})

app.use(authAdmin)

app.get("/getUniqueUsers", async (req, res) => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const times = await AccessTimes.find({"lastAccess": {"$gte": yesterday, "$lte": today}})

    if(times === undefined) {
        return res.status(200).json({"count": 0})
    }
    return res.status(200).json({"count": times.length})
})

app.get("/topUsers", async (req, res) => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const recentUsers = await AccessTimes.find({"lastAccess": {"$gte": yesterday, "$lte": today}})
    
    let highIndex = -1
    let currentHigh = -1
    for(let i = 0; i < recentUsers.length; i++) {
        let recentAccesses = await EndpointAccess.find({"username": recentUsers[i].username})
        if(recentAccesses.length > currentHigh) {
            currentHigh = recentAccesses.length
            highIndex = i
        }
    }

    return res.status(200).json({"username": recentUsers[highIndex].username, "count": currentHigh})
})

app.get("/topUsersByEndpoint", async (req, res) => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const recentUsers = await AccessTimes.find({"lastAccess": {"$gte": yesterday, "$lte": today}})

    let highIndexGetAll = -1
    let currentHighGetAll = -1
    for(let i = 0; i < recentUsers.length; i++) {
        const result = await EndpointAccess.aggregate([
            {$match: {"username": recentUsers[i].username, "endpoint": "Get all pokemon", "time": {"$gte": yesterday, "$lte": today}}}
        ]).exec()

        if(result.length > currentHighGetAll) {
            currentHighGetAll = result.length
            highIndexGetAll = i
        }
    }

    let highIndexGetOne = -1
    let currentHighGetOne = -1
    for(let i = 0; i < recentUsers.length; i++) {
        const result = await EndpointAccess.aggregate([
            {$match: {"username": recentUsers[i].username, "endpoint": "Get pokemon details", "time": {"$gte": yesterday, "$lte": today}}}
        ]).exec()

        if(result.length > currentHighGetOne) {
            currentHighGetOne = result.length
            highIndexGetOne = i
        }
    }

    return res.status(200).json({"getAll": {"username": recentUsers[highIndexGetAll].username, "count": currentHighGetAll}, "getDetails": {"username": recentUsers[highIndexGetOne].username, "count": currentHighGetOne}})
})

app.get("/errorsByEndpoint", async (req, res) => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    let allErrors = await Error.find({"time": {"$gte": yesterday, "$lte": today}})
    let getAllErrors = ""
    let getDetailErrors = ""

    for(let i = 0; i < allErrors.length; i++) {
        if(allErrors[i].endpoint === "Get all pokemon") {
            getAllErrors = getAllErrors + "Endpoint: " + allErrors[i].endpoint + ", time: " + allErrors[i].time + ", error: " + allErrors[i].error + ", "
        } else {
            getDetailErrors = getDetailErrors + "Endpoint: " + allErrors[i].endpoint + ", time: " + allErrors[i].time + ", error: " + allErrors[i].error + ", "
        }

        if(getAllErrors === "") {
            getAllErrors = "No recent errors"
        }
        if(getDetailErrors === "") {
            getDetailErrors = "No recent errors"
        }
    }

    return res.status(200).json({"getAll": getAllErrors, "getDetails": getDetailErrors})
})