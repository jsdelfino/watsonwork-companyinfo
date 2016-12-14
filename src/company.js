// Extract company entities from text, and retrieve company information

import * as request from 'request';
import * as util from 'util';
import debug from 'debug';

// Setup debug log
const log = debug('watsonwork-companyinfo-entities');

// Return company entities recognized in the given text
export const entities = (text, spaceId, messageId, time, userId, userName,
  fruserId, frkey, cb) => {
  // Post request to entity recognition service
  request.post(process.env.COMPANYINFO_FR_ER_URL, {
    json: true,
    body: {
      postedBy: { 
        id: userId,
        name: userName
      },
      timeStamp: new Date(time).toUTCString(),
      threadId: spaceId,
      postId: messageId,
      postText: text
    }
  }, (err, val) => {
    if(err) {
      // Error communicating with the entity recognition service
      log('Error calling entity recognition service %o', err);
      cb(err);
      return;
    }

    log('Entity recognition response code %d body %o',
      val.statusCode, val.body);
    if(val.statusCode != 200) {
      // Entity recognition service error
      cb({
        statusCode: val.statusCode,
        message: 'Couln\'t extract entities from text'
      });
      return;
    }

    // Collect recognized company entities
    const entities =
      (val.body && val.body.result && val.body.result.entity || [])
      .map((e) => ({
        id: e.searchToken,
        score: e.relevanceScore
      }));
    log('Recognized company entities %o', entities);
    cb(null, entities);
  });
};

// Return company metadata for the given company entity id
export const metadata = (id, fruserId, frkey, cb) => {
  // Send request to company entity information service
  request.get(util.format(process.env.COMPANYINFO_FR_METADATA_URL, id), {
    json: true,
    headers: {
      frUserId: fruserId,
      authKey: frkey
    }
  }, (err, val) => {
    if(err) {
      // Error communicating with the entity information service
      log('Error calling entity information service %o', err);
      cb(err);
      return;
    }

    log('Entity information response code %d body %o',
      val.statusCode, val.body);
    if(val.statusCode != 200) {
      // Entity information service error
      cb({
        statusCode: val.statusCode,
        message: 'Couln\'t retrieve entity information'
      });
      return;
    }

    // Extract company entity metadata
    const res = val.body && val.body.result && val.body.result;
    const info = res ? {
      name: res.name,
      languages: res.data.entityMap.language,
      industries: res.data.entityMap.industry,
      sectors: res.data.entityMap.sector,
      segments: res.data.entityMap.segment
    } : undefined;
    log('Company info %o', info);
    cb(null, info);
  });
};

