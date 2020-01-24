const mysql = require("mysql");
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require('path');
const routes = require("./routes/index");

const app = express();

app.set('trust proxy', 1);

app.use(session({
    secret: 'anahtar',
    resave: false,
    saveUninitialized: true
}));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.set('view engine', 'pug');

const database = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "123456",
    database: "mydb",
});

database.connect(function (err) {
    if (err) throw err;
    console.log("Database connected");
});
global.database = database;

app.use("/", routes);

const server = app.listen(3000, () => {
    console.log(`Running on port ${server.address().port}`);
});

module.exports = app;