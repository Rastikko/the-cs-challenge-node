const firebaseAdmin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://the-cs-challenge.firebaseio.com"
});

const db = firebaseAdmin.database();

const gamesRef = db.ref("games");
const questionsRef = db.ref("questions");
const userQuestionsRef = db.ref("userQuestions");

function getQuestionsKeys() {
    return new Promise(function(resolve) {
        questionsRef.once('value', function(snapshot) {
            // TODO: Pick some random instead of all
            resolve(Object.keys(snapshot.val()));
        });
    });
}

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

function handleAnswer() {
    // Change state to DONE
    // add correct field to userQuestions
    // set endTime property
}

function handleStartedQuestion() {
    // add startTime
}

gamesRef.on('child_added', function(snapshot) {
  var newGame = snapshot.val();
  if (newGame.state === 'NEW') {
      handleNewGame(snapshot);
  }
});

userQuestionsRef.on('')