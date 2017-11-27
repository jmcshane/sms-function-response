'use strict';

const twilio = require('twilio');
const uuidv4 = require('uuid/v4');
const runtimeConfig = require('cloud-functions-runtime-config');
const MessagingResponse = twilio.twiml.MessagingResponse;

const projectId = process.env.GCLOUD_PROJECT;
const region = 'us-central1';
const authToken = runtimeConfig.getVariable('dev-config', 'TWILIO_AUTH_TOKEN');
const isLive = runtimeConfig.getVariable('dev-config', 'IS_LIVE');
const datastore = require('@google-cloud/datastore')();

function buildResultKey() {
  return datastore.key(['PokerResult', uuidv4()]);
}
function buildPlayerKey(number) {
  return datastore.key(['PokerPlayer', number]);
}

function savePlayer(requestBody, res) {
  const key = buildPlayerKey(requestBody.From);
  const playerName = requestBody.Body.replace(/my name is\s*/i,'');
  const entity = {
    key: key,
    data: {name : playerName}
  }
  datastore.save(entity)
      .then(() => {
        console.log("Saved complete");
        textResponse(res,'You have been registered for the Olson poker game. Submit results as "Up 5" or "Down 3".');
      })
      .catch((err)=> {
        console.error(err);
        console.log("Save failed");
        emptyResponse(res, 500);
      });
}

function parseBody(body) {
  const value = parseInt(body.match(/\d+/)[0]);
  if (body.toLowerCase().indexOf("down") > -1) {
    return value * -1;
  }
  return value;
}

function parseDate() {
  const today = new Date()
  let year = today.getFullYear();
  let month = today.getMonth();
  let date = today.getDate();
  let day = today.getDay();
  date = date - (day - 1);
  return year + "/" + month + "/" + date;
}

function savePokerResult(requestBody, res) {
  const key = buildResultKey();
  const playerKey = buildPlayerKey(requestBody.From);

  datastore.get(playerKey)
    .then(([entity]) => {
      if (!entity) {
        textResponse(res,'Please register by replying "My name is <NAME>", then submit your result');
      }
      const resultEntity = {
        key: key,
        data: {result : parseBody(requestBody.Body), time: parseDate(), player: entity.name}
      };
      return datastore.save(resultEntity);
    })
    .then(() => {
      textResponse(res,'Result successfully saved');
    })
    .catch((err) => {
      console.error(err);
      emptyResponse(res, 500);
    });
}

function validate(isAppRunning, tokenValue) {
  if (isAppRunning === 'Running') {
    return twilio.validateExpressRequest(req, tokenValue, {
      url: `https://${region}-${projectId}.cloudfunctions.net/reply`
    });
  } else {
    return true;
  }
}

function emptyResponse(res, status) {
  res
    .status(status)
    .end();
}

function textResponse(res, text) {
  const response = new MessagingResponse();
  response.message('Please register by replying "My name is <Your Name>", then resubmit your result');
  res
    .status(200)
    .type('text/xml')
    .end(response.toString());
}

exports.reply = (req, res) => {
  Promise.all([isLive, authToken]).then(values => {
    console.log(values);
    if (!validate(values[0], values[1])) {
      res
      .type('text/plain')
      .status(403)
      .send('Twilio Request Validation Failed.')
      .end();
    } else {
      if (req.body.Body.toLowerCase().indexOf("my name") > -1) {
        savePlayer(req.body, res);
      } else {
        savePokerResult(req.body, res);
      }    
    }
  });
};
