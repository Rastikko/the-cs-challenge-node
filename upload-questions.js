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
  updates[`/questions/${newQuestionkey}`] = question;
  return db.ref().update(updates);
});