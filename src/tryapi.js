import * as company from './company.js'

company.entities('I\'m meeting with folks at Boeing tomorrow',
  'testspaceid', 'testmsgid', Date.now(), 'testuserid', 'testusername',
  process.env.COMPANYINFO_FR_USER_ID,
  process.env.COMPANYINFO_FR_KEY,
  (err, entities) => {
    console.log(err);
    console.log(entities);

    company.metadata(entities[1].id,
      process.env.COMPANYINFO_FR_USER_ID,
      process.env.COMPANYINFO_FR_KEY,
      (err, info) => {
        console.log(err);
        console.log(info);
      });
  });
