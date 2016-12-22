const firebaseAdmin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://the-cs-challenge.firebaseio.com"
});

const db = firebaseAdmin.database();

const gamesRef = db.ref("games");
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

/**
 * User questions handlers
 */
function handleUserQuestionAnswer(userQuestionSnapshot) {
    console.log('handleAnswer', userQuestionSnapshot.answer);
    getAnswer(userQuestionSnapshot.val().answer).then(function(answer) {
        userQuestionsRef.child(`${userQuestionSnapshot.key}`).update({
            endTime: new Date,
            state: 'ANSWERED',
            // TODO: calculate score instead
            correct: answer.correct ? 'YES' : 'NO'
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

gamesRef.on('child_added', function(snapshot) {
  var newGame = snapshot.val();
  if (newGame.state === 'NEW') {
      handleNewGame(snapshot);
  }
});

userQuestionsRef.on('child_added', handleUserQuestionsUpdates);
userQuestionsRef.on('child_changed', handleUserQuestionsUpdates);