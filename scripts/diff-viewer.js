const inquirer = require('inquirer');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');
require('dotenv').config();
const { default: open } = require('open');
const jsondiffpatch = require('jsondiffpatch').create({
    arrays: {
        detectMove: true
    }
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    global: {
      headers: {
        'Accept-Encoding': 'utf-8',
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
  }
);

// Create a simple Express server to serve the diff viewer
const app = express();
const port = 3333; // Different from your main React app port

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add save endpoint
app.post('/save', async (req, res) => {
  try {
    const updatedData = req.body;
    const { data, error } = await supabase
      .from('business_analysis')
      .insert({
        analysis_data: updatedData,
        analysis_period_start: new Date().toISOString().replace(/\.\d+/, ''),
        analysis_period_end: new Date().toISOString().replace(/\.\d+/, '')
      })
      .select();

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a simple HTML page for viewing diffs
const createHtml = (oldVersion, newVersion) => {
    const oldData = JSON.stringify(oldVersion)
        .replace(/</g, '\\u003c')  // Escape < to prevent XSS
        .replace(/\//g, '\\/');    // Escape / to prevent </script> issues
        
    const newData = JSON.stringify(newVersion)
        .replace(/</g, '\\u003c')
        .replace(/\//g, '\\/');
        
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Diff Viewer</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/editor/editor.main.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsondiffpatch/0.4.1/jsondiffpatch.umd.min.js"><\/script>
    <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .container { 
            display: flex; 
            gap: 20px; 
            height: 90vh; 
        }
        .left-panel {
            display: flex;
            flex-direction: column;
            gap: 20px;
            flex: 2;
        }
        .right-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        .editor { 
            border: 1px solid #ccc; 
            flex: 1;
            min-height: 0;
        }
        .buttons { text-align: center; margin-top: 20px; }
        button { padding: 10px 20px; margin: 0 10px; }
        .line-delete { background-color: rgba(255, 0, 0, 0.2); }
        .line-insert { background-color: rgba(0, 255, 0, 0.2); }
        .line-modify { background-color: rgba(255, 255, 0, 0.2); }
    </style>
</head>
<body>
    <div class="container">
        <div class="left-panel">
            <div id="oldVersion" class="editor"></div>
            <div id="newVersion" class="editor"></div>
        </div>
        <div class="right-panel">
            <div id="editVersion" class="editor"></div>
        </div>
    </div>
    <div class="buttons">
        <button onclick="saveChanges()">Save Changes</button>
    </div>
    
    <!-- Load Monaco loader first -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.js"><\/script>
    
    <script>
        
        // Initialize data
        const oldVersion = ${oldData};
        const newVersion = ${newData};

        function formatJson(obj) {
            return JSON.stringify(obj, null, 2);
        }

        // Wait for window load to ensure Monaco loader is available
        window.onload = function() {
            require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});
            
            require(['vs/editor/editor.main'], function() {
                // Create editors with formatted JSON
                console.log('Initializing editors...');

                window.oldEditor = monaco.editor.create(document.getElementById('oldVersion'), {
                    value: formatJson(oldVersion),
                    language: 'json',
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'none',
                    lineNumbers: 'on',
                    encoding: 'utf8'
                });

                window.newEditor = monaco.editor.create(document.getElementById('newVersion'), {
                    value: formatJson(newVersion),
                    language: 'json',
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'none',
                    lineNumbers: 'on',
                    encoding: 'utf8'
                });

                // Sync scrolling between old and new editors
                oldEditor.onDidScrollChange(e => {
                    newEditor.setScrollTop(e.scrollTop);
                    newEditor.setScrollLeft(e.scrollLeft);
                });

                newEditor.onDidScrollChange(e => {
                    oldEditor.setScrollTop(e.scrollTop);
                    oldEditor.setScrollLeft(e.scrollLeft);
                });

                window.editEditor = monaco.editor.create(document.getElementById('editVersion'), {
                    value: formatJson(newVersion),
                    language: 'json',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    encoding: 'utf8'
                });

                // Function to save changes
                window.saveChanges = async function() {
                    try {
                        const updatedData = JSON.parse(window.editEditor.getValue());
                        const response = await fetch('/save', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8',
                            },
                            body: JSON.stringify(updatedData)
                        });

                        if (!response.ok) {
                            throw new Error('Failed to save changes');
                        }

                        alert('Changes saved successfully!');
                    } catch (error) {
                        console.error('Error saving changes:', error);
                        alert('Failed to save changes: ' + error.message);
                    }
                };

                // Format editors after creation
                setTimeout(() => {
                    oldEditor.getAction('editor.action.formatDocument').run();
                    newEditor.getAction('editor.action.formatDocument').run();
                    editEditor.getAction('editor.action.formatDocument').run();
                }, 100);

                // After editors are created, compute and apply diffs
                console.log('Computing diffs...');
                const diffpatcher = jsondiffpatch.create();

                const delta = diffpatcher.diff(oldVersion, newVersion);
                //console.log('Computed delta:', delta);

                // Process the delta to get changes
                function processChanges(delta, path = '') {
                    const changes = [];
                    
                    if (!delta) return changes;
                    
                    // First level is always categories
                    function processObject(obj, currentPath, parentCategory = '', parentBusiness = '') {
                        Object.keys(obj).forEach(key => {
                            const newPath = currentPath ? currentPath + '.' + key : key;
                            const value = obj[key];

                            if (Array.isArray(value)) {
                                if (value.length === 2) {
                                    changes.push({
                                        type: 'modify',
                                        path: newPath,
                                        oldValue: value[0],
                                        newValue: value[1],
                                        category: parentCategory || key,
                                        businessName: parentBusiness
                                    });
                                } else if (value.length === 1) {
                                    const insertData = value[0];
                                    if (insertData && typeof insertData === 'object') {
                                        changes.push({
                                            type: 'insert',
                                            path: newPath,
                                            value: insertData,
                                            category: parentCategory || key,
                                            businessName: parentBusiness || key
                                        });
                                    }
                                }
                            } else if (typeof value === 'object' && value !== null) {
                                const newCategory = !currentPath ? key : parentCategory;
                                const newBusiness = currentPath && !parentBusiness ? key : parentBusiness;
                                processObject(value, newPath, newCategory, newBusiness);
                            }
                        });
                    };

                    processObject(delta, '');
                    
                    return changes;
                }

                const changes = processChanges(delta);
                //console.log('Processed changes:', changes);

                // Helper to find the end of a JSON block
                function findBlockEnd(model, startLine) {
                    let bracketCount = 0;
                    let currentLine = startLine;
                    const lineCount = model.getLineCount();
                    
                    while (currentLine <= lineCount) {
                        const lineContent = model.getLineContent(currentLine);
                        bracketCount += (lineContent.match(/{/g) || []).length;
                        bracketCount -= (lineContent.match(/}/g) || []).length;
                        
                        if (bracketCount === 0) {
                            return currentLine;
                        }
                        currentLine++;
                    }
                    return startLine;
                }

                // Apply decorations
                console.log('Applying decorations...');
                const oldModel = oldEditor.getModel();
                const newModel = newEditor.getModel();

                changes.forEach(change => {
                    // Get the search key based on change type
                    let searchKey = change.path;
                    //console.log('Search key:', searchKey);
                    if (change.type === 'modify') {
                        // For modifications, get exact positions in both editors
                        const oldValue = change.oldValue;
                        const newValue = change.newValue;
                        
                        // Find the exact position in both editors using the path
                        const oldPosition = oldModel.getPositionAt(oldModel.getValue().indexOf(JSON.stringify(oldValue)));
                        const newPosition = newModel.getPositionAt(newModel.getValue().indexOf(JSON.stringify(newValue)));
                        
                        if (oldPosition && newPosition) {
                            // Get the block sizes
                            const oldStartLine = oldPosition.lineNumber;
                            const oldEndLine = findBlockEnd(oldModel, oldStartLine);
                            const oldBlockSize = oldEndLine - oldStartLine + 1;

                            const newStartLine = newPosition.lineNumber;
                            const newEndLine = findBlockEnd(newModel, newStartLine);
                            const newBlockSize = newEndLine - newStartLine + 1;

                            // Use the larger block size for both decorations
                            const maxBlockSize = Math.max(oldBlockSize, newBlockSize);

                            // Apply decorations to both editors
                            oldEditor.deltaDecorations([], [{
                                range: new monaco.Range(oldStartLine, 1, oldStartLine + maxBlockSize - 1, 1),
                                options: {
                                    isWholeLine: true,
                                    className: 'line-modify',
                                    glyphMarginClassName: 'line-modify'
                                }
                            }]);

                            newEditor.deltaDecorations([], [{
                                range: new monaco.Range(newStartLine, 1, newStartLine + maxBlockSize - 1, 1),
                                options: {
                                    isWholeLine: true,
                                    className: 'line-modify',
                                    glyphMarginClassName: 'line-modify'
                                }
                            }]);
                        }
                    } else if (change.type === 'insert') {
                        // For insertions, find the correct location using the path
                        const pathParts = change.path.split('.');
                        const category = pathParts[0];
                        const businessName = pathParts[1];
                        
                        // Search for the category and business name to get the correct position
                        const categoryMatch = newModel.findMatches(
                            '"' + category + '"',
                            false, false, true, null, true
                        );
                        
                        if (categoryMatch.length > 0) {
                            const categoryStartLine = categoryMatch[0].range.startLineNumber;
                            const categoryEndLine = findBlockEnd(newModel, categoryStartLine);
                            
                            // Find the business name within this category
                            const businessMatch = newModel.findMatches(
                                '"' + businessName + '"',
                                false, false, true, null, true
                            ).filter(match => 
                                match.range.startLineNumber > categoryStartLine && 
                                match.range.startLineNumber < categoryEndLine
                            );
                            
                            if (businessMatch.length > 0) {
                                const newStartLine = businessMatch[0].range.startLineNumber;
                                const newEndLine = findBlockEnd(newModel, newStartLine);
                                const blockSize = newEndLine - newStartLine + 1;

                                // Add blank lines in old editor
                                oldModel.applyEdits([{
                                    range: new monaco.Range(newStartLine, 1, newStartLine, 1),
                                    text: '\\n'.repeat(blockSize),
                                    forceMoveMarkers: true
                                }]);

                                // Highlight the blank space in old editor
                                oldEditor.deltaDecorations([], [{
                                    range: new monaco.Range(newStartLine, 1, newStartLine + blockSize - 1, 1),
                                    options: {
                                        isWholeLine: true,
                                        className: 'line-insert',
                                        glyphMarginClassName: 'line-insert'
                                    }
                                }]);

                                // Highlight the actual content in new editor
                                newEditor.deltaDecorations([], [{
                                    range: new monaco.Range(newStartLine, 1, newEndLine, 1),
                                    options: {
                                        isWholeLine: true,
                                        className: 'line-insert',
                                        glyphMarginClassName: 'line-insert'
                                    }
                                }]);
                            }
                        }
                    }
                });

                console.log('Decoration application complete');
            });
        };
    </script>
</body>
</html>`;
};

// Main function to start the diff viewer
async function startDiffViewer() {
  try {
    // Fetch last two versions
    const { data, error } = await supabase
      .from('business_analysis')
      .select('analysis_data, created_at')
      .order('created_at', { ascending: false })
      .limit(2);

    if (error) throw error;

    if (data.length < 2) {
      console.error('Not enough versions to compare');
      return;
    }

    // Create HTML file with the diff viewer
    app.get('/', (req, res) => {
      res.send(createHtml(data[1].analysis_data, data[0].analysis_data));
    });

    // Start server and open browser
    app.listen(port, () => {
      const url = 'http://localhost:' + port;
      console.log('Diff viewer running at ' + url);
      
      openBrowser(url).catch(error => {
        console.error('Critical error in openBrowser:', {
          type: error.name,
          message: error.message,
          stack: error.stack
        });
      });
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

startDiffViewer();

async function openBrowser(url) {
  const browsers = [
    {name: 'chrome'},
    {name: 'firefox'},
    {name: 'edge'}
  ];

  console.log('Attempting to open browser...');
  
  // Try default browser with error classification
  try {
    console.log('Trying default system browser...');
    await open(url);
    return;
  } catch (error) {
    // Classify error types
    if (error.code === 'ENOENT') {
      console.error('Error: Browser executable not found');
    } else if (error.code === 'EACCES') {
      console.error('Error: Permission denied to execute browser');
    } else if (error.code === 'EPERM') {
      console.error('Error: Operation not permitted (might need admin rights)');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('Error: Operation timed out');
    } else {
      console.error('Unexpected error:', {
        code: error.code,
        message: error.message,
        command: error.command,
        path: error.path
      });
    }

    // Log full error for debugging
    console.debug('Full error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      command: error.command,
      path: error.path,
      spawnargs: error.spawnargs
    });
  }

  // Try specific browsers with detailed error reporting
  for (const browser of browsers) {
    try {
      console.log('Trying ' + browser.name + '...');
      await open(url, {app: browser});
      return;
    } catch (error) {
      console.log('Failed to open ' + browser.name + ':', {
        errorType: error.name,
        errorCode: error.code,
        details: error.message
      });
    }
  }

  // Final fallback message
  console.log('\nBrowser opening failed. Common causes:');
  console.log('1. No compatible browser installed');
  console.log('2. Browser executables not in PATH');
  console.log('3. Permission issues');
  console.log('4. Antivirus blocking the operation');
  console.log('\nPlease open this URL manually: ' + url);
}