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

let tokenValue = "";
let isAppRunning = "";
authToken.then((val) => tokenValue = val);
isLive.then((val) => isAppRunning = val);

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
        endResponse(res, 200);
      })
      .catch((err)=> {
        console.error(err);
        console.log("Save failed");
        endResponse(res, 500);
      });
}

function savePokerResult(requestBody, res) {
  const key = buildResultKey();
  const playerKey = buildPlayerKey(requestBody.From);

  datastore.get(playerKey)
    .then(([entity]) => {
      if (!entity) {
        throw new Error(`No entity found for key ${requestBody.From}.`);
      }
      const resultEntity = {
        key: key,
        data: {message : requestBody.Body, time: new Date(), player: entity.name}
      };
      return datastore.save(resultEntity);
    })
    .then(() => {
      console.log("Saved complete");
      endResponse(res, 200);
    })
    .catch((err) => {
      console.error(err);
      endResponse(res, 500);
    });

}
function validate() {
  if (isAppRunning === 'Running') {
    return twilio.validateExpressRequest(req, tokenValue, {
      url: `https://${region}-${projectId}.cloudfunctions.net/reply`
    });
  } else {
    return true;
  }
}

function endResponse(res, status) {
  res
    .status(status)
    .end();
}

exports.reply = (req, res) => {
  if (!validate()) {
    res
      .type('text/plain')
      .status(403)
      .send('Twilio Request Validation Failed.')
      .end();
    return;
  }
  if (req.body.Body.toLowerCase().indexOf("my name") > -1) {
    savePlayer(req.body, res);
  } else {
    savePokerResult(req.body, res);
  }
};
