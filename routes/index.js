const express = require('express');
const {
    body,
    validationResult
} = require('express-validator');
const router = express.Router();
const NodeCache = require('node-cache');

const cache = new NodeCache({
    stdTTL: 5 * 60
});

//Uncomment below to close the cache
//cache.close();


const usernameQuery = "SELECT * FROM `users` WHERE user_name = ?";
const usernamePasswordQuery = "SELECT * FROM `users` WHERE user_name = ? AND password = ?";
const userInsertQuery = "INSERT INTO `users` (user_name, password) VALUES (?, ?)";
const articleNumberQuery = "SELECT COUNT(*) FROM `articles`;";
const articleListQuery = "SELECT * FROM `articles` ORDER BY id DESC LIMIT ?, ?;";
const articleSearchQuery = "SELECT * FROM `articles` WHERE (title LIKE ? OR summary LIKE ? OR content LIKE ? OR author LIKE ?) ORDER BY id DESC;";
const articleInsertQuery = "INSERT INTO `articles` (author, content, summary, title, date_established, last_updated) VALUES (?, ?, ?, ?, NOW(), NOW())";
const articleSelectQuery = "SELECT * FROM `articles` WHERE id = ?";
const articleEditQuery = "UPDATE `articles` SET author = ?, content = ?, summary = ?, title = ?, last_updated = NOW() WHERE id = ?;";
const articleDeleteQuery = "DELETE FROM `articles` WHERE id = ?";
const commentSelectByArticleQuery = "SELECT * FROM `comments` WHERE article_id = ?";
const commentSelectByIdQuery = "SELECT * FROM `comments` WHERE comment_id = ?";
const commentInsertQuery = "INSERT INTO `comments` (comment, author, article, written_at, article_id) VALUES (?, ?, ?, NOW(), ?)";
const commentDeleteQuery = "DELETE FROM `comments` WHERE comment_id = ?";
const commentDeleteByArticleQuery = "DELETE FROM `comments` WHERE article_id = ?";


router.get("/", (req, res) => {
    res.redirect("/articles");
});

router.get("/login", (req, res) => {
    res.render("homepage", {
        title: "Homepage",
    });
});

router.post("/login", (req, res) => {
    let username = req.body.username;
    let password = req.body.password;
    database.query(usernamePasswordQuery, [username, password], (err, result) => {
        if (err) {
            return res.status(500).send(err);
        }
        if (result.length > 0) {
            req.session.loggedIn = 1;
            req.session.username = username;
            res.redirect("/articles");
        } else {
            res.render("wrongPasswordPage", {
                title: "Homepage"
            });
        }
    });
});

router.get("/articles", (req, res) => {
    res.redirect("/articles/1");
});

router.get("/articles/:id", (req, res) => {
    let currentPage = req.params.id;
    if (!req.session.username) {
        req.session.username = "visitor";
    }
    let render = function (count, result) {
        articleBefore(result);
        res.render("articles", {
            title: "Articles",
            data: result,
            user: req.session.username,
            currentPage: currentPage,
            maxPageCount: count,
            loggedIn: req.session.loggedIn,
        });
    };
    let articleCacheKey = req.protocol + '://' + req.headers.host + req.originalUrl;
    let pageCountCacheKey = req.protocol + '://' + req.headers.host + req.originalUrl + "count";
    let articleCache = cache.get(articleCacheKey);
    let pageCountCache = cache.get(pageCountCacheKey);
    if (articleCache && pageCountCache) {
        console.log(`${articleCacheKey} cache'den geldi.`);
        render(pageCountCache, articleCache);
    } else {
        database.query(articleNumberQuery, (err, numberResult) => {
            if (err) {
                throw err;
            }
            let articleCount = Object.values(numberResult[0])[0];
            let maxPageCount = Math.ceil(articleCount / 10);
            cache.set(pageCountCacheKey, maxPageCount);
            database.query(articleListQuery, [(+currentPage - 1) * 10, 10], (err, result) => {
                if (err) {
                    throw err;
                }
                cache.set(articleCacheKey, result);
                render(maxPageCount, result);
            });
        });
    }
});

router.post("/articles/:id", (req, res) => {
    let search = req.body.search;
    database.query(articleSearchQuery, ['%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%'], (err, result) => {
        if (err) {
            return res.status(500).send(err);
        }
        articleBefore(result);
        res.render("searchResults", {
            title: "Search Results",
            data: result,
            user: req.session.username,
            keyword: search,
            loggedIn: req.session.loggedIn,
        });
    });
});

router.get("/registration", (req, res) => {
    res.render("registration", {
        title: "Sign up"
    });
});

router.post("/registration", [
        body("newpassword")
        .isLength({
            min: 6
        })
        .withMessage("Your password must be at least 6 characters long."),
    ],
    (req, res) => {
        let errors = validationResult(req);
        if (errors.isEmpty()) {
            let username = req.body.newusername;
            let password = req.body.newpassword;
            database.query(usernameQuery, [username], (err, result) => {
                if (err) {
                    return res.status(500).send(err);
                }
                if (result.length > 0) {
                    res.render("sameUserName", {
                        title: "Sign up"
                    });
                } else {
                    database.query(userInsertQuery, [username, password], (err, result) => {
                        if (err) {
                            return res.status(500).send(err);
                        }
                        res.render("successfullRegistration", {
                            title: "Registration successful!"
                        });
                    });
                }
            });
        } else {
            res.render("registration", {
                title: "Sign up",
                errors: errors.array(),
            });
        }
    }
);

router.get("/add", (req, res) => {
    if (req.session.loggedIn) {
        res.render("add", {
            title: "Writing Area",
        });
    } else res.redirect("/");
});

router.post("/add", (req, res) => {
    let content = req.body.content;
    let title = req.body.title;
    let summary = req.body.summary;
    if (!req.session.username) {
        req.session.username = "anonymus";
    }
    database.query(articleInsertQuery, [req.session.username, content, summary, title], (err) => {
        if (err) {
            throw err;
        }
        cache.flushAll();
        res.render("articleAdded", {
            title: "Article added",
        });
    });
});

router.get("/read/:id", (req, res) => {
    let articleId = req.params.id;
    let backURL = req.header('Referer') || '/';
    let render = function (article, comments) {
        res.render("readArticle", {
            title: article[0].title,
            data: article[0],
            commentdata: comments,
            user: req.session.username,
            loggedIn: req.session.loggedIn,
            back: backURL,
        });
    };
    let readCacheKey = req.protocol + '://' + req.headers.host + req.originalUrl;
    let commentCacheKey = req.protocol + '://' + req.headers.host + req.originalUrl + "comment";
    let readCache = cache.get(readCacheKey);
    let commentCache = cache.get(commentCacheKey);
    if (readCache && commentCache) {
        console.log(`${readCacheKey} cache'den geldi`);
        render(readCache, commentCache);
    } else database.query(articleSelectQuery, [articleId], (err, result) => {
        if (err) {
            throw err;
        } else if (!result.length) {
            res.sendStatus(404);
        } else {
            cache.set(readCacheKey, result);
            database.query(commentSelectByArticleQuery, [result[0].id], (err, commentResult) => {
                if (err) {
                    throw err;
                }
                cache.set(commentCacheKey, commentResult);
                render(result, commentResult);
            });
        }
    });
});

router.post("/read/:id", (req, res) => {
    let comment = req.body.comment;
    let author = req.session.username;
    let article = req.body.title;
    let articleId = req.params.id;
    database.query(commentInsertQuery, [comment, author, article, articleId], (err, result) => {
        if (err) {
            throw err;
        }
        cache.flushAll();
        res.redirect(`/read/${req.params.id}`);
    });
});

router.get("/delete/:id", (req, res) => {
    let articleId = req.params.id;
    if (req.session.loggedIn) {
        database.query(articleSelectQuery, [articleId], (err, result) => {
            if (err) {
                throw err;
            }
            if (!result.length) {
                res.render("articleNotFound", {
                    title: "no such article"
                });
            } else if (result[0].author == req.session.username) {
                database.query(articleDeleteQuery, ['' + articleId + ''], (err, result) => {
                    if (err) {
                        throw err;
                    }
                    database.query(commentDeleteByArticleQuery, [articleId], (req, res) => {
                        if (err) {
                            throw err;
                        }
                    });
                    cache.flushAll();
                    res.redirect("/articles");
                });
            } else res.redirect("/articles");
        });
    } else res.redirect("/");
});

router.get("/commentdelete/:id", (req, res) => {
    let commentId = req.params.id;
    let backURL = req.header('Referer') || '/';
    if (req.session.loggedIn) {
        database.query(commentSelectByIdQuery, [commentId], (err, result) => {
            if (err) {
                throw err;
            }
            if (!result.length) {
                res.send("the comment you tried to delete does not exist");
            } else if (result[0].author == req.session.username) {
                database.query(commentDeleteQuery, [commentId], (err, result) => {
                    if (err) {
                        throw err;
                    }
                    cache.flushAll();
                    res.redirect(backURL);
                });
            } else res.redirect(backURL);
        });
    } else res.redirect("/");
});

router.get("/logout", (req, res) => {
    req.session.loggedIn = 0;
    req.session.username = "visitor";
    res.redirect("/");
});

router.get("/edit/:id", (req, res) => {
    let articleId = req.params.id;
    if (req.session.loggedIn) {
        database.query(articleSelectQuery, [articleId], (err, result) => {
            if (err) {
                throw err;
            }
            if (!result.length) {
                res.sendStatus(404);
            } else if (result[0].author == req.session.username) {
                if (err) {
                    throw err;
                }
                res.render("editArticle", {
                    title: result[0].title,
                    data: result[0],
                });
            } else res.redirect("/");
        });
    } else res.redirect("/");
});

router.post("/edit/:id", (req, res) => {
    let articleId = req.params.id;
    let content = req.body.content;
    let title = req.body.title;
    let summary = req.body.summary;
    if (!req.session.username) {
        req.session.username = "anonymus";
    }
    database.query(articleEditQuery, [req.session.username, content, summary, title, articleId], (err) => {
        if (err) {
            throw err;
        }
        cache.flushAll();
        res.render("articleEdited", {
            title: "Article edited",
        });
    });
});

router.get("/stress/:id", (req, res) => {
    let num = req.params.id;
    let title = 'Lorem ipsum dolor sit amet';
    let content = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales.";
    let summary = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non euismod purus. Morbi viverra sed mauris at placerat. Integer iaculis nulla sed orci congue interdum. In molestie hendrerit mattis. Maecenas erat nunc, sagittis id lectus non, malesuada efficitur mauris. Cras blandit congue commodo. Sed porttitor molestie ligula sit amet scelerisque. Vestibulum efficitur lectus vitae condimentum posuere. Mauris feugiat tortor at aliquet sodales.";
    if (num < 1012) {
        let before = Date.now();
        let multipleArticleInsertQuery = "INSERT INTO `articles` (author, content, summary, title, date_established, last_updated) VALUES ";
        let arr = [];
        let insert = function (max) {
            for (let i = 0; i < max; i++) {
                multipleArticleInsertQuery += `('test', ?, ?, ?, NOW(), NOW())`;
                if (i == max - 1) break;
                multipleArticleInsertQuery += ",";
            }
            for (let i = 0; i < max; i++) {
                arr.push(content);
                arr.push(summary);
                arr.push(title);
            }
        };
        insert(num);
        database.query(multipleArticleInsertQuery, arr, (err, result) => {
            if (err) throw err;
            let after = Date.now();
            console.log(`${num} tane article yaratıp eklemek ${after - before} ms sürdü.`);
        });
        cache.flushAll();
        res.redirect("/");
    } else {
        let before = Date.now();
        for (let i = 0; i < num; i++) {
            database.query(articleInsertQuery, ["test", content, summary, title], (err, result) => {
                if (err) throw err;
                if (i == num - 1) {
                    let after = Date.now();
                    console.log(`${req.params.id} yazıyı database'e yazmak: ${after - before} ms`);
                }
            });
        }
        cache.flushAll();
        res.redirect("/");
    }
});

router.get("/purge", (req, res) => {
    let before = Date.now();
    database.query("DELETE FROM `articles`;", (err, result) => {
        if (err) throw err;
        let after = Date.now();
        console.log(`deleting all articles: ${after - before} ms`);
    });
    database.query("DELETE FROM `comments`;", (err, result) => {
        if (err) throw err;
        let after = Date.now();
        console.log(`deleting all comments: ${after - before} ms`);
    });
    cache.flushAll();
    res.redirect("/");
});

router.get("/random/:id", (req, res) => {
    let num = req.params.id;
    if (num < 9000) {
        let before = Date.now();
        let multipleArticleInsertQuery = "INSERT INTO `articles` (author, content, summary, title, date_established, last_updated) VALUES ";
        let insert = function (max) {
            for (let i = 0; i < max; i++) {
                multipleArticleInsertQuery += "(?, ?, ?, ?, NOW(), NOW())";
                if (i == max - 1) break;
                multipleArticleInsertQuery += ",";
            }
        };
        let autconsumtit = [];
        for (let i = 0; i < num; i++) {
            let content = "";
            let summary = "";
            let title = "";
            let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789   ';
            let charsLength = chars.length;
            autconsumtit.push("randomized");
            for (let p = 0; p < Math.random() * 100000; p++) {
                content += chars.charAt(Math.floor(Math.random() * charsLength));
            }
            autconsumtit.push(content);
            for (let p = 0; p < Math.random() * 100; p++) {
                summary += chars.charAt(Math.floor(Math.random() * charsLength));
            }
            autconsumtit.push(summary);
            for (let p = 0; p < Math.random() * 100; p++) {
                title += chars.charAt(Math.floor(Math.random() * charsLength));
            }
            autconsumtit.push(title);
        }
        insert(num);
        database.query(multipleArticleInsertQuery, autconsumtit, (err, result) => {
            if (err) throw err;
            let after = Date.now();
            console.log(`${num} tane article yaratıp eklemek ${after - before} ms sürdü.`);
        });
        cache.flushAll();
        res.redirect("/");
    } else {
        let before = Date.now();
        for (let i = 0; i < num; i++) {
            let content = "";
            let summary = "";
            let title = "";
            let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
            let charsLength = chars.length;
            for (let p = 0; p < Math.random() * 10000; p++) {
                content += chars.charAt(Math.floor(Math.random() * charsLength));
            }
            for (let p = 0; p < Math.random() * 100; p++) {
                summary += chars.charAt(Math.floor(Math.random() * charsLength));
            }
            for (let p = 0; p < Math.random() * 100; p++) {
                title += chars.charAt(Math.floor(Math.random() * charsLength));
            }
            database.query(articleInsertQuery, ["randomized", content, summary, title], (err, result) => {
                if (err) throw err;
                if (i == num - 1) {
                    let after = Date.now();
                    console.log(`${num} tane article yaratıp eklemek ${after - before} ms sürdü.`);
                }
            });
        }
        cache.flushAll();
        res.redirect("/");
    }
});


function articleBefore(result) {
    let lastUpdated;
    result.forEach(element => {
        lastUpdated = element.last_updated;
        let now = new Date();
        let fark = now - lastUpdated;
        if (fark < 60000) {
            lastUpdated = `${Math.round(fark/1000)} seconds ago`;
        } else if (fark < 3600000) {
            lastUpdated = `${Math.round(fark/60000)} minutes ago`;
        } else if (fark < 86400000) {
            lastUpdated = `${Math.round(fark/3600000)} hours ago`;
        } else {
            lastUpdated = `${Math.round(fark/86400000)} days ago`;
        }
        element.before = lastUpdated;
    });
}


module.exports = router;