require('dotenv').config();
const { analyzeAllMessages } = require('../lib/analysis.js');

async function runAnalysis() {
  try {
    console.log('Starting message analysis...');
    const result = await analyzeAllMessages();
    console.log('Analysis completed successfully!');
  } catch (error) {
    console.error('Error running analysis:', error);
    process.exit(1);
  }
}

// Run analysis
runAnalysis()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });