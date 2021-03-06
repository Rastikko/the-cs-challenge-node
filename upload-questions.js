const firebaseAdmin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

const questions = require('./fixtures/questions.json')
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://the-cs-challenge.firebaseio.com"
});

const db = firebaseAdmin.database();

questions.forEach(function(question) {
  let updates = {};

  let awnsers = {};
  question.answers.map(function(answer) {
      let newAnswerkey = db.ref().child('answers').push().key;
      updates[`/answers/${newAnswerkey}`] = answer;
      awnsers[newAnswerkey] = true;
  });
  
  let newQuestionkey = db.ref().child('questions').push().key;
  question.answers = awnsers;
  question.totalAnswers = 0;
  question.totalCorrectAnswers = 0;
  question.totalCorrectTime = 0;
  updates[`/questions/${newQuestionkey}`] = question;
  // add a little hack to answer a question with a timeout
  updates['/answers/timeout-answer-id/correct'] = false;
  return db.ref().update(updates);
});