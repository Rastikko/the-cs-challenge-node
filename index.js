const firebaseAdmin = require("firebase-admin");
const isHeroku = (process.env.NODE && ~process.env.NODE.indexOf("heroku"));
const serviceAccount = (isHeroku) ? require("./serviceaccountheroku.js") : require("./serviceaccountkey.json");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://the-cs-challenge.firebaseio.com"
});

const db = firebaseAdmin.database();

const gamesRef = db.ref("games");
const oldGamesRef = db.ref("oldGames");
const questionsRef = db.ref("questions");
const answersRef = db.ref("answers");
const userQuestionsRef = db.ref("userQuestions");
const scoresRef = db.ref("scores");

const MAX_QUESTION_TIME = 70000;

/**
 * Randomize array element order in-place.
 * Using Durstenfeld shuffle algorithm.
 */
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

/**
 * Retrieve data
 */
function getQuestionsKeys() {
    return new Promise(function(resolve) {
        questionsRef.once('value', function(snapshot) {
            // TODO: Pick some random instead of all
            let keysArray = Object.keys(snapshot.val());
            shuffleArray(keysArray);
            resolve(keysArray);
        });
    });
}

function getAnswer(answernKey) {
    return new Promise(function(resolve) {
        answersRef.child(answernKey).once('value', function(snapshot) {
            // TODO: Pick some random instead of all
            resolve(snapshot.val());
        });
    });
}

/**
 * Game handlers
 */
function createUserQuestions(questionKeys, uid) {
    let updates = {};
    let userQuestionKeys = {};
    questionKeys.forEach(function(questionKey, i) {
        let newUserQuestionKey = userQuestionsRef.push().key;
        updates[`/userQuestions/${newUserQuestionKey}/state`] = 'NONE';
        updates[`/userQuestions/${newUserQuestionKey}/question`] = questionKey;
        updates[`/userQuestions/${newUserQuestionKey}/uid`] = uid;
        userQuestionKeys[newUserQuestionKey] = true;
    });
    return { updates, userQuestionKeys };
}

function getUserQuestionsDataPromises(userQuestionsKeys) {
    userQuestionsDataPromises = [];
    userQuestionsKeys.forEach(function(userQuestionKey) {
        userQuestionsDataPromises.push(userQuestionsRef.child(userQuestionKey).once('value'));
    });

    return userQuestionsDataPromises;
}

function handleNewGame(gameSnapshot) {
    getQuestionsKeys().then(function(questionKeys) {
        let {updates, userQuestionKeys} = createUserQuestions(questionKeys, gameSnapshot.val().uid);
        updates[`/games/${gameSnapshot.key}/state`] = 'INPROGRESS';
        updates[`/games/${gameSnapshot.key}/userQuestions`] = userQuestionKeys;
        updates[`/games/${gameSnapshot.key}/currentUserQuestion`] = Object.keys(userQuestionKeys)[0];
        db.ref().update(updates);
    });
}

function handleFinishedGame(gameSnapshot) {
    let finishedTime = new Date();
    let userQuestionsKeys = Object.keys(gameSnapshot.val().answeredUserQuestions);

    let userQuestionsDataPromises = getUserQuestionsDataPromises(userQuestionsKeys);

    gamesRef.child(`${gameSnapshot.key}`).update({
        finishedTime: new Date()
    });

    Promise.all(userQuestionsDataPromises).then(function(userQuestions) {

        let totalScore = 0;

        userQuestions.forEach(function(snapshot) {
            if (snapshot.val().score) {
                totalScore += snapshot.val().score;
            }
        });

        let oldGameRef = oldGamesRef.push();

        oldGameRef.set({
            uid: gameSnapshot.key,
            answeredUserQuestions: gameSnapshot.val().answeredUserQuestions,
            gameEndTime: finishedTime
        });

        scoresRef.push().set({
            uid: gameSnapshot.key,
            oldGameId: oldGameRef.key,
            score: totalScore
        });

        gamesRef.child(`${gameSnapshot.key}`).update({
            score: totalScore
        });

    });

    // TODO: delete non responded user questions gameSnapshot.val().userQuestions
}

function handleGameUpdate(gameSnapshot) {
    let game = gameSnapshot.val();
    if (game.state === 'NEW') {
        return handleNewGame(gameSnapshot);
    }
    if (game.state === 'FINISHED' && game.finishedTime === undefined && game.score === undefined) {
        return handleFinishedGame(gameSnapshot);
    }
}

/**
 * User questions handlers
 */

function updateQuestionData(questionKey, userQuestionKey) {

    questionsRef.child(questionKey).once('value', function(questionSnapshot) {
        userQuestionsRef.child(userQuestionKey).once('value', function(userQuestionSnapshot) {
            let question = questionSnapshot.val();
            let userQuestion = userQuestionSnapshot.val();

            let totalAnswers = question.totalAnswers;
            let totalCorrectAnswers = question.totalCorrectAnswers;
            let endTime = new Date(userQuestion.endTime);
            let startTime = new Date(userQuestion.startTime);
            let timeDiff = Math.abs(endTime.getTime() - startTime.getTime());
            timeDiff = Math.min(timeDiff, MAX_QUESTION_TIME);
            let totalCorrectTime = question.totalCorrectTime;
            let averageCorrectTime = (totalCorrectAnswers === 0) ? MAX_QUESTION_TIME : totalCorrectTime / totalCorrectAnswers;
            
            let score;
            if (userQuestion.correct === 'YES') {
                score = (totalAnswers === 0) ? 200 : 100 * (2 - totalCorrectAnswers / totalAnswers);
                if (timeDiff < averageCorrectTime) {
                    score += 30 * (2 - timeDiff / averageCorrectTime);
                }
            } else {
                score = 0;
            }

            totalAnswers += 1;
            totalCorrectAnswers += (userQuestion.correct === 'YES') ? 1 : 0;
            totalCorrectTime += (userQuestion.correct === 'YES') ? timeDiff : 0;
            let updates = {};

            updates[`questions/${questionKey}/totalAnswers`] = totalAnswers;
            updates[`questions/${questionKey}/totalCorrectAnswers`] = totalCorrectAnswers;
            updates[`questions/${questionKey}/totalCorrectTime`] = totalCorrectTime;
            updates[`userQuestions/${userQuestionKey}/score`] = Math.round(score);

            db.ref().update(updates);
        });
    });
}

function handleUserQuestionAnswer(userQuestionSnapshot) {
    getAnswer(userQuestionSnapshot.val().answer).then(function(answer) {
        let endTime = new Date();

        // TODO: if the question is over the timeout fail it.

        userQuestionsRef.child(`${userQuestionSnapshot.key}`).update({
            endTime: endTime,
            state: 'ANSWERED',
            correct: answer.correct ? 'YES' : 'NO'
        });
        
        let updates = {};

        updates[`/games/${userQuestionSnapshot.val().uid}/answeredUserQuestions/${userQuestionSnapshot.key}`] = true;

        let currentUserQuestionPromise = Promise.resolve(null);

        if (!answer.correct) {
            updates[`/games/${userQuestionSnapshot.val().uid}/state`] = 'FINISHED';
        } else {
            currentUserQuestionPromise = new Promise(function(resolve) {
                gamesRef.child(`${userQuestionSnapshot.val().uid}`).once('value', function(gameSnapshot) {
                    let game = gameSnapshot.val();
                    let currentUserQuestion = game.currentUserQuestion;
                    let userQuestionsArray = Object.keys(game.userQuestions);

                    let indexOfCurrentUserQuestion = userQuestionsArray.indexOf(currentUserQuestion);
                    if (indexOfCurrentUserQuestion < userQuestionsArray.length - 1) {
                        resolve(userQuestionsArray[indexOfCurrentUserQuestion + 1]);
                    } else {
                        resolve('LAST_QUESTION');
                    }
                });
            });
        }

        currentUserQuestionPromise.then(function(currentUserQuestion) {
            if (currentUserQuestion === 'LAST_QUESTION') {
                updates[`/games/${userQuestionSnapshot.val().uid}/state`] = 'FINISHED';
                updates[`/games/${userQuestionSnapshot.val().uid}/currentUserQuestion`] = null;
            } else {
                updates[`/games/${userQuestionSnapshot.val().uid}/currentUserQuestion`] = currentUserQuestion;
            }
            db.ref().update(updates, function() {
                updateQuestionData(userQuestionSnapshot.val().question, userQuestionSnapshot.key);
            });
        });
    });
}

function handleUserQuestionStarted(userQuestionSnapshot) {
    userQuestionsRef.child(`${userQuestionSnapshot.key}`).update({
        startTime: new Date()
    });
}

function handleUserQuestionsUpdates(snapshot) {
    const changedQuestion = snapshot.val();
    const startedQuestion = changedQuestion.state === 'STARTED';

    if (startedQuestion && !changedQuestion.startTime) {
        return handleUserQuestionStarted(snapshot);
    }

    if (startedQuestion && changedQuestion.answer) {
        return handleUserQuestionAnswer(snapshot);
    }
}

gamesRef.on('child_added', handleGameUpdate);
gamesRef.on('child_changed', handleGameUpdate);

userQuestionsRef.on('child_added', handleUserQuestionsUpdates);
userQuestionsRef.on('child_changed', handleUserQuestionsUpdates);