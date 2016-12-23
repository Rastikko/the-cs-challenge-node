const firebaseAdmin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

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

/**
 * Retrieve data
 */
function getQuestionsKeys() {
    return new Promise(function(resolve) {
        questionsRef.once('value', function(snapshot) {
            // TODO: Pick some random instead of all
            resolve(Object.keys(snapshot.val()));
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

function handleNewGame(gameSnapshot) {
    getQuestionsKeys().then(function(questionKeys) {
        let {updates, userQuestionKeys} = createUserQuestions(questionKeys, gameSnapshot.val().uid);
        updates[`/games/${gameSnapshot.key}/state`] = 'INPROGRESS';
        updates[`/games/${gameSnapshot.key}/userQuestions`] = userQuestionKeys;
        db.ref().update(updates);
    });
}

function handleFinishedGame(gameSnapshot) {
    let finishedTime = new Date();
    gamesRef.child(`${gameSnapshot.key}`).update({
        finishedTime: new Date()
    });

    oldGamesRef.push().set({
        uid: gameSnapshot.key,
        answeredUserQuestions: gameSnapshot.val().answeredUserQuestions,
        gameEndTime: finishedTime
    });

    // TODO: delete non responded user questions gameSnapshot.val().userQuestions
}

function handleGameUpdate(gameSnapshot) {
    let game = gameSnapshot.val();
    if (game.state === 'NEW') {
        return handleNewGame(gameSnapshot);
    }
    if (game.state === 'FINISHED' && !game.finishedTime) {
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
            // We only account up to 40 seconds
            timeDiff = Math.min(timeDiff, 40000);
            let totalCorrectTime = question.totalCorrectTime;
            let averageCorrectTime = (totalCorrectAnswers === 0) ? 40000 : totalCorrectTime / totalCorrectAnswers;
            
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
            updates[`userQuestions/${userQuestionKey}/score`] = Math.abs(score);

            db.ref().update(updates);
        });
    });
}

function handleUserQuestionAnswer(userQuestionSnapshot) {
    getAnswer(userQuestionSnapshot.val().answer).then(function(answer) {
        let endTime = new Date();
        userQuestionsRef.child(`${userQuestionSnapshot.key}`).update({
            endTime: endTime,
            state: 'ANSWERED',
            // TODO: calculate also the score
            correct: answer.correct ? 'YES' : 'NO'
        });

        
        let updates = {};

        updates[`/games/${userQuestionSnapshot.val().uid}/answeredUserQuestions/${userQuestionSnapshot.key}`] = true;

        if (!answer.correct) {
           updates[`/games/${userQuestionSnapshot.val().uid}/state/`] = 'FINISHED';
        }

        db.ref().update(updates, function() {
            updateQuestionData(userQuestionSnapshot.val().question, userQuestionSnapshot.key);
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