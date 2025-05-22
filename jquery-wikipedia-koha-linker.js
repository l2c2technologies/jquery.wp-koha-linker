/**
 * jQuery Wikipedia Search Plugin
 *
 * This plugin searches Wikipedia for names and subjects in library catalog records
 * and adds links to matching Wikipedia articles using Wikipedia Preview for popups
 * to Koha ILS's OPAC details page.
 *
 * Author  : Indranil Das Gupta <indradg@l2c2.co.in>
 * Version : 0.1-beta
 * License : GNU GPLv3+
 */
(function($) {
  'use strict';
  
  // Plugin defaults
  const defaults = {
    apiUrl: 'https://en.wikipedia.org/w/api.php',
    selectors: {
      names: '.contributors span[property="name"]',
      subjects: '.subject'
    },
    linkClass: 'wp-search',
    dataAttr: 'data-wp-title'
  };
  
  // Levenshtein distance calculator
  function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
  
  // Calculate string similarity percentage
  function stringSimilarity(a, b) {
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    return ((maxLength - distance) / maxLength) * 100;
  }
  
  // Plugin constructor
  function WikipediaSearch(element, options) {
    this.element = element;
    this.settings = $.extend({}, defaults, options);
    this.searchPromises = []; // Track all search promises
    this.init();
  }
  
  // Plugin methods
  $.extend(WikipediaSearch.prototype, {
    init: function() {
      const self = this;
      const $element = $(this.element);
      
      // Process names
      $element.find(this.settings.selectors.names).each(function() {
        const promise = self.processName($(this).text(), $(this));
        self.searchPromises.push(promise);
      });
      
      // Process subjects
      $element.find(this.settings.selectors.subjects).each(function() {
        const promise = self.processSubject($(this).text(), $(this));
        self.searchPromises.push(promise);
      });
    },
    
    processName: function(name, $elementToStyle) {
      // Create a promise for this operation
      return new Promise((resolve) => {
        // Check if the name contains a comma (indicating lastName, firstName format)
        if (name.includes(',')) {
          const parts = name.split(',');
          if (parts.length === 2) {
            const lastName = parts[0].trim();
            const firstAndMiddleNames = parts[1].trim();
            
            // Create search term in firstName lastName format
            const searchTerm = firstAndMiddleNames + ' ' + lastName;
            console.log("Searching Wikipedia for name:", searchTerm);
            
            // Return the promise from searchWikipediaForName
            this.searchWikipediaForName(searchTerm, lastName, firstAndMiddleNames, $elementToStyle, name)
              .then(resolve);
          } else {
            // If there are multiple commas, treat as a subject
            this.processSubject(name, $elementToStyle).then(resolve);
          }
        } else {
          // If no comma, treat as a subject
          this.processSubject(name, $elementToStyle).then(resolve);
        }
      });
    },
    
    processSubject: function(subject, $elementToStyle) {
      return new Promise((resolve) => {
        // Get the original text
        const originalText = $elementToStyle.text();
        
        // Split the subject heading into components based on " -- " delimiter
        const components = originalText.split(/\s+--\s+/);
        
        // If there's only one component, process it using the existing method
        if (components.length === 1) {
          this.processSubjectComponent(originalText, $elementToStyle)
            .then(resolve);
          return;
        }
        
        // Create a container to hold our processed components
        const $container = $('<span>');
        
        // Process each component separately
        const componentPromises = [];
        
        for (let i = 0; i < components.length; i++) {
          const component = components[i];
          
          // Add separator between components
          if (i > 0) {
            $container.append(' -- ');
          }
          
          // Create a span for this component
          const $componentSpan = $('<span>').text(component);
          $container.append($componentSpan);
          
          // Process this component and collect the promise
          const promise = this.processSubjectComponent(component, $componentSpan);
          componentPromises.push(promise);
        }
        
        // Replace the original element's content with our processed container
        $elementToStyle.html($container);
        
        // Wait for all component promises to resolve
        Promise.all(componentPromises).then(resolve);
      });
    },
    
    processSubjectComponent: function(component, $componentElement) {
      return new Promise((resolve) => {
        // Check if component has parenthetical information
        const parenthesesMatch = component.match(/^(.*?)\s*\(([^)]+)\)$/);
        
        if (parenthesesMatch) {
          // We have main text and parenthetical text
          const mainText = parenthesesMatch[1].trim();
          const parentheticalText = parenthesesMatch[2].trim();
          
          // Create a container for this component
          const $container = $('<span>');
          
          // Create spans for main text and parenthetical text
          const $mainSpan = $('<span>').text(mainText);
          const $parentheticalSpan = $('<span>').text(parentheticalText);
          
          // Add them to the container
          $container.append($mainSpan);
          $container.append(' (');
          $container.append($parentheticalSpan);
          $container.append(')');
          
          // Replace the component element's content
          $componentElement.html($container);
          
          const promises = [];
          
          // Process the main text
          if (this.looksLikePersonName(mainText)) {
            promises.push(this.processPersonNameComponent(mainText, $mainSpan));
          } else {
            promises.push(this.searchWikipediaForSubjectComponent(mainText, $mainSpan));
          }
          
          // Check if parenthetical text is a year/date range or an acronym
          if (/^[\d\s\-–—.,\/]+$/.test(parentheticalText)) {
            // It's a year or date range
            promises.push(this.processYearOrDateRange(parentheticalText, $parentheticalSpan));
          } else {
            // It's likely an acronym or abbreviation
            promises.push(this.searchWikipediaForAcronym(parentheticalText, $parentheticalSpan));
          }
          
          Promise.all(promises).then(resolve);
        } else if (this.looksLikePersonName(component)) {
          // This component looks like a person's name
          this.processPersonNameComponent(component, $componentElement).then(resolve);
        } else {
          // Regular subject component
          this.searchWikipediaForSubjectComponent(component, $componentElement).then(resolve);
        }
      });
    },
    
    processPersonNameComponent: function(nameText, $nameElement) {
      return new Promise((resolve) => {
        const parts = nameText.split(',');
        const lastName = parts[0].trim();
        const firstAndMiddleNames = parts.length > 1 ? parts[1].trim() : '';
        
        // Create search term in firstName lastName format
        const searchTerm = firstAndMiddleNames + ' ' + lastName;
        
        this.searchWikipediaForName(searchTerm, lastName, firstAndMiddleNames, $nameElement, nameText)
          .then(resolve);
      });
    },
    
    searchWikipediaForSubjectComponent: function(subject, $elementToStyle) {
      return new Promise((resolve) => {
        // Check if subject contains parentheses (fallback for any we missed)
        const parenthesesMatch = subject.match(/\(([^)]+)\)/);
        
        if (parenthesesMatch) {
          // Use the existing method for backward compatibility
          this.processSubjectComponent(subject, $elementToStyle).then(resolve);
          return;
        }
        
        // Search Wikipedia for this subject
        this.searchWikipedia(subject, $elementToStyle, subject).then(resolve);
      });
    },
    
    // Check if a string looks like a person's name (LastName, FirstName)
    looksLikePersonName: function(text) {
      // Simple heuristic: contains one comma and no digits
      return text.split(',').length === 2 && !/\d/.test(text);
    },
    
    processYearOrDateRange: function(text, $elementToStyle) {
      return new Promise((resolve) => {
        const self = this;
        
        // Extract years from the date range
        const years = this.extractYearsFromDateRange(text);
        
        if (years.length > 0) {
          // Create a new element to replace the original
          const $newElement = $('<span>');
          
          // Get the original text
          const originalText = $elementToStyle.text();
          
          // Find the positions of years in the original text
          let lastIndex = 0;
          let currentPos = 0;
          
          const yearPromises = [];
          
          years.forEach(year => {
            // Find the position of this year in the original text, starting from lastIndex
            currentPos = originalText.indexOf(year, lastIndex);
            
            if (currentPos >= 0) {
              // Add text before the year
              $newElement.append(originalText.substring(lastIndex, currentPos));
              
              // Create a span for the year that will be styled
              const $yearSpan = $('<span>', {
                text: year,
                class: self.settings.linkClass,
                [self.settings.dataAttr]: year
              });
              
              // Add the year span
              $newElement.append($yearSpan);
              
              // Search Wikipedia for this year
              const yearPromise = self.searchWikipediaForYear(year, $yearSpan);
              yearPromises.push(yearPromise);
              
              // Update lastIndex to after this year
              lastIndex = currentPos + year.length;
            }
          });
          
          // Add any remaining text
          if (lastIndex < originalText.length) {
            $newElement.append(originalText.substring(lastIndex));
          }
          
          // Replace the original element with our new one
          $elementToStyle.replaceWith($newElement);
          
          // Wait for all year searches to complete
          Promise.all(yearPromises).then(resolve);
        } else {
          // If no years found, search Wikipedia for the whole text
          this.searchWikipedia(text, $elementToStyle, text).then(resolve);
        }
      });
    },
    
    extractYearsFromDateRange: function(text) {
      // Match 4-digit years
      const yearMatches = text.match(/\b\d{4}\b/g);
      return yearMatches || [];
    },
    
    // Helper function to check if a result appears to be a citation or reference
    isCitationOrReference: function(result) {
      if (!result || !result.snippet) return false;
      
      const snippet = result.snippet;
      
      // Check for common citation patterns
      return (
        snippet.includes("{{cite") || 
        snippet.includes("ISBN") ||
        snippet.includes("Retrieved") ||
        snippet.includes("pp.") ||
        snippet.includes("p.") ||
        snippet.includes("vol.") ||
        snippet.includes("edition") ||
        snippet.includes("publisher") ||
        /\}\}\s*<span class="searchmatch">/.test(snippet) ||
        /<span class="searchmatch">.*?\}\}/.test(snippet) ||
        /\d{4}\)\./.test(snippet) // Year followed by ). pattern
      );
    },
    
    searchWikipediaForName: function(searchTerm, lastName, firstAndMiddleNames, $elementToStyle, originalName) {
      const self = this;
      
      return new Promise((resolve) => {
        this.wp_searchWikipedia(searchTerm).done(function(data) {
          console.log("Wikipedia results for name:", data);
          
          if (data && data.query && data.query.search && data.query.search.length > 0) {
            const results = data.query.search;
            
            // Filter out results that appear to be citations or references
            const filteredResults = results.filter(result => !self.isCitationOrReference(result));
            
            // Use filtered results if available, otherwise fall back to original results
            const resultsToProcess = filteredResults.length > 0 ? filteredResults : results;
            
            let matchFound = false;
            
            // Check if any result title contains the last name
            for (const result of resultsToProcess) {
              const title = result.title;
              
              // Check if last name is in the title
              if (title.toLowerCase().includes(lastName.toLowerCase())) {
                console.log(`Last name "${lastName}" found in title "${title}"`);
                
                // Check if title contains first name or initials
                if (title.toLowerCase().includes(firstAndMiddleNames.toLowerCase())) {
                  console.log(`First/middle names "${firstAndMiddleNames}" found in title "${title}"`);
                  self.applyStylingIfMatch($elementToStyle, originalName, title);
                  matchFound = true;
                  break;
                }
                
                // Check for initials match
                const firstNameInitials = firstAndMiddleNames
                  .replace(/[\s\.,]/g, '')
                  .split('')
                  .map(c => c.toUpperCase());
                
                const titleWords = title.split(/\s+/);
                let matchedInitials = 0;
                
                for (const word of titleWords) {
                  if (word.length > 0 && firstNameInitials.includes(word[0].toUpperCase())) {
                    matchedInitials++;
                  }
                }
                
                if (matchedInitials >= firstNameInitials.length) {
                  console.log(`Initials match found for "${firstAndMiddleNames}" in title "${title}"`);
                  self.applyStylingIfMatch($elementToStyle, originalName, title);
                  matchFound = true;
                  break;
                }
              }
            }
            
            // If no match found in titles, check snippets for famous people with different known names
            if (!matchFound && resultsToProcess.length > 0) {
              // Check if all parts of the name appear in the snippet of the first result
              const firstResult = resultsToProcess[0];
              const snippet = firstResult.snippet || '';
              
              // Get all parts of the name (both first and last name)
              const nameParts = [];
              if (lastName) nameParts.push(lastName);
              if (firstAndMiddleNames) {
                firstAndMiddleNames.split(/\s+/).forEach(part => {
                  if (part.length > 1) nameParts.push(part); // Only consider parts with at least 2 characters
                });
              }
              
              // Check if name parts appear in close proximity in the snippet
              const cleanSnippet = snippet.replace(/<\/?span[^>]*>/g, ''); // Remove HTML tags
              const snippetWords = cleanSnippet.split(/\s+/);
              
              // Find positions of each name part in the snippet
              const namePartPositions = {};
              let allPartsFound = true;
              
              for (const part of nameParts) {
                namePartPositions[part] = [];
                let partFound = false;
                
                for (let i = 0; i < snippetWords.length; i++) {
                  const cleanWord = snippetWords[i].replace(/[.,;:!?()[\]{}'"]/g, '').toLowerCase();
                  if (cleanWord === part.toLowerCase()) {
                    namePartPositions[part].push(i);
                    partFound = true;
                  }
                }
                
                if (!partFound) {
                  allPartsFound = false;
                }
              }
              
              // Check if we found all name parts
              if (allPartsFound) {
                // Check if all parts are in close proximity
                const proximityCheck = self.checkNamePartsProximity(namePartPositions, nameParts);
                
                if (proximityCheck.inProximity) {
                  // Additional validation: Check if the title contains at least one of the name parts
                  // This helps prevent false positives like "Sati, Vishwambhar Prasad" matching with "Nautiyal"
                  const titleContainsNamePart = nameParts.some(part => 
                     firstResult.title.toLowerCase().includes(part.toLowerCase())
                  );
                  
                  if (titleContainsNamePart) {
                    console.log(`All name parts found in close proximity for "${originalName}": "${firstResult.title}"`);
                    self.applyStylingIfMatch($elementToStyle, originalName, firstResult.title);
                    matchFound = true;
                  } else {
                    console.log(`Name parts found in proximity but title doesn't contain any name part for "${originalName}"`);
                  }
                } else {
                  console.log(`Name parts found but not in close proximity for "${originalName}"`);
                }
              } else {
                // Second try: Use Levenshtein distance for fuzzy matching in close proximity
                const fuzzyMatches = self.findFuzzyNameMatches(nameParts, snippetWords);
                
                if (fuzzyMatches.allPartsMatched) {
                  const proximityCheck = self.checkFuzzyMatchesProximity(fuzzyMatches.matches);
                  
                  if (proximityCheck.inProximity) {
                    // Additional validation: Check if the title contains at least one of the name parts
                    const titleContainsNamePart = nameParts.some(part => {
                      const titleWords = firstResult.title.toLowerCase().split(/\s+/);
                      return titleWords.some(word => {
                        const similarity = stringSimilarity(part.toLowerCase(), word.toLowerCase());
                        return similarity >= 80; // 80% similarity threshold
                      });
                    });
                    
                    if (titleContainsNamePart) {
                      console.log(`Fuzzy match found in close proximity for "${originalName}": "${firstResult.title}"`);
                      self.applyStylingIfMatch($elementToStyle, originalName, firstResult.title);
                      matchFound = true;
                    } else {
                      console.log(`Fuzzy matches found in proximity but title doesn't contain any name part for "${originalName}"`);
                    }
                  } else {
                    console.log(`Fuzzy matches found but not in close proximity for "${originalName}"`);
                  }
                }
              }
              
              // If still no match found, fall back to the original fuzzy matching logic
              if (!matchFound) {
                // First try: Check if all name parts appear exactly in the snippet
                const allPartsInSnippet = nameParts.every(part => 
                   snippet.toLowerCase().includes(part.toLowerCase())
                );
                
                if (allPartsInSnippet) {
                  // Additional check: make sure the name parts are not just appearing in different contexts
                  // Check if the title contains at least one of the name parts
                  const titleContainsNamePart = nameParts.some(part => 
                     firstResult.title.toLowerCase().includes(part.toLowerCase())
                  );
                  
                  if (titleContainsNamePart) {
                    console.log(`All name parts found in snippet and title contains name part for "${originalName}": "${firstResult.title}"`);
                    self.applyStylingIfMatch($elementToStyle, originalName, firstResult.title);
                    matchFound = true;
                  } else {
                    console.log(`All name parts found in snippet but title doesn't contain any name part for "${originalName}"`);
                  }
                } else {
                  // Second try: Use Levenshtein distance for fuzzy matching
                  // Extract words from the snippet
                  const snippetWords = snippet.replace(/<\/?span[^>]*>/g, '').split(/\s+/);
                  
                  // Check if each name part has a close match in the snippet
                  const fuzzyMatch = nameParts.every(part => {
                    // For each name part, find the closest match in the snippet
                    return snippetWords.some(word => {
                      // Clean up the word (remove punctuation)
                      const cleanWord = word.replace(/[.,;:!?()[\]{}'"]/g, '');
                      if (cleanWord.length < 3) return false; // Skip very short words
                      
                      // Calculate similarity
                      const similarity = stringSimilarity(part.toLowerCase(), cleanWord.toLowerCase());
                      return similarity >= 80; // 80% similarity threshold
                    });
                  });
                  
                  if (fuzzyMatch) {
                    // Additional check: make sure the title contains at least one of the name parts
                    const titleContainsNamePart = nameParts.some(part => {
                      const titleWords = firstResult.title.toLowerCase().split(/\s+/);
                      return titleWords.some(word => {
                        const similarity = stringSimilarity(part.toLowerCase(), word.toLowerCase());
                        return similarity >= 80; // 80% similarity threshold
                      });
                    });
                    
                    if (titleContainsNamePart) {
                      console.log(`Fuzzy match found for "${originalName}": "${firstResult.title}"`);
                      self.applyStylingIfMatch($elementToStyle, originalName, firstResult.title);
                      matchFound = true;
                    } else {
                      console.log(`Fuzzy match found in snippet but title doesn't contain any name part for "${originalName}"`);
                    }
                  }
                }
              }
            }
            
            if (!matchFound) {
              console.log(`No match found for "${originalName}"`);
            }
          } else {
            console.log(`No Wikipedia results for "${searchTerm}"`);
          }
          
          resolve();
        }).fail(function(error) {
          console.error("Wikipedia search error:", error);
          resolve();
        });
      });
    },
    
    checkNamePartsProximity: function(namePartPositions, nameParts) {
      // Check if all name parts are within a reasonable distance of each other
      const maxDistance = 5; // Maximum number of words between name parts
      
      // Get all positions for each name part
      const allPositions = [];
      for (const part of nameParts) {
        if (namePartPositions[part] && namePartPositions[part].length > 0) {
          allPositions.push(...namePartPositions[part]);
        }
      }
      
      // Sort positions
      allPositions.sort((a, b) => a - b);
      
      // Check if all positions are within maxDistance of each other
      for (let i = 1; i < allPositions.length; i++) {
        if (allPositions[i] - allPositions[i-1] > maxDistance) {
          return { inProximity: false };
        }
      }
      
      return { inProximity: true, positions: allPositions };
    },
    
    findFuzzyNameMatches: function(nameParts, snippetWords) {
      const matches = {};
      let allPartsMatched = true;
      
      for (const part of nameParts) {
        matches[part] = [];
        let partMatched = false;
        
        for (let i = 0; i < snippetWords.length; i++) {
          const cleanWord = snippetWords[i].replace(/[.,;:!?()[\]{}'"]/g, '');
          if (cleanWord.length < 3) continue; // Skip very short words
          
          const similarity = stringSimilarity(part.toLowerCase(), cleanWord.toLowerCase());
          if (similarity >= 80) { // 80% similarity threshold
            matches[part].push(i);
            partMatched = true;
          }
        }
        
        if (!partMatched) {
          allPartsMatched = false;
        }
      }
      
      return { allPartsMatched, matches };
    },
    
    checkFuzzyMatchesProximity: function(matches) {
      // Check if all fuzzy matches are within a reasonable distance of each other
      const maxDistance = 5; // Maximum number of words between name parts
      
      // Get all positions for each name part
      const allPositions = [];
      for (const part in matches) {
        if (matches[part] && matches[part].length > 0) {
          allPositions.push(...matches[part]);
        }
      }
      
      // Sort positions
      allPositions.sort((a, b) => a - b);
      
      // Check if all positions are within maxDistance of each other
      for (let i = 1; i < allPositions.length; i++) {
        if (allPositions[i] - allPositions[i-1] > maxDistance) {
          return { inProximity: false };
        }
      }
      
      return { inProximity: true, positions: allPositions };
    },
    
    searchWikipediaForYear: function(year, $elementToStyle) {
      const self = this;
      
      return new Promise((resolve) => {
        this.wp_searchWikipedia(year).done(function(data) {
          if (data && data.query && data.query.search && data.query.search.length > 0) {
            const results = data.query.search;
            
            // Look for an exact match for the year
            for (const result of results) {
              if (result.title === year) {
                console.log(`Exact match found for year "${year}"`);
                self.applyStylingIfMatch($elementToStyle, year, result.title);
                break;
              }
            }
          }
          
          resolve();
        }).fail(function(error) {
          console.error("Wikipedia search error:", error);
          resolve();
        });
      });
    },
    
    searchWikipediaForAcronym: function(acronym, $elementToStyle) {
      const self = this;
      
      return new Promise((resolve) => {
        this.wp_searchWikipedia(acronym).done(function(data) {
          if (data && data.query && data.query.search && data.query.search.length > 0) {
            const results = data.query.search;
            
            // Look for an exact match for the acronym
            for (const result of results) {
              if (result.title === acronym) {
                console.log(`Exact match found for acronym "${acronym}"`);
                self.applyStylingIfMatch($elementToStyle, acronym, result.title);
                break;
              }
            }
          }
          
          resolve();
        }).fail(function(error) {
          console.error("Wikipedia search error:", error);
          resolve();
        });
      });
    },
    
    searchWikipedia: function(searchTerm, $elementToStyle, originalText) {
      const self = this;
      
      return new Promise((resolve) => {
        this.wp_searchWikipedia(searchTerm).done(function(data) {
          if (data && data.query && data.query.search && data.query.search.length > 0) {
            const results = data.query.search;
            
            // Filter out results that appear to be citations or references
            const filteredResults = results.filter(result => !self.isCitationOrReference(result));
            
            // Use filtered results if available, otherwise fall back to original results
            const resultsToProcess = filteredResults.length > 0 ? filteredResults : results;
            
            // Look for an exact match first
            for (const result of resultsToProcess) {
              if (result.title.toLowerCase() === searchTerm.toLowerCase()) {
                console.log(`Exact match found for "${searchTerm}"`);
                self.applyStylingIfMatch($elementToStyle, originalText, result.title);
                resolve();
                return;
              }
            }
            
            // If no exact match, look for a close match
            for (const result of resultsToProcess) {
              const similarity = stringSimilarity(searchTerm.toLowerCase(), result.title.toLowerCase());
              if (similarity >= 90) { // 90% similarity threshold
                console.log(`Close match found for "${searchTerm}": "${result.title}" (${similarity.toFixed(2)}%)`);
                self.applyStylingIfMatch($elementToStyle, originalText, result.title);
                resolve();
                return;
              }
            }
            
            // If no close match, check if the search term is a substring of any result title
            for (const result of resultsToProcess) {
              if (result.title.toLowerCase().includes(searchTerm.toLowerCase())) {
                console.log(`Substring match found for "${searchTerm}": "${result.title}"`);
                self.applyStylingIfMatch($elementToStyle, originalText, result.title);
                resolve();
                return;
              }
            }
            
            // If still no match, check if any result title is a substring of the search term
            for (const result of resultsToProcess) {
              if (searchTerm.toLowerCase().includes(result.title.toLowerCase())) {
                console.log(`Title is substring of search term for "${searchTerm}": "${result.title}"`);
                self.applyStylingIfMatch($elementToStyle, originalText, result.title);
                resolve();
                return;
              }
            }
            
            // If still no match, use the first result if it's relevant
            if (resultsToProcess.length > 0) {
              const firstResult = resultsToProcess[0];
              const similarity = stringSimilarity(searchTerm.toLowerCase(), firstResult.title.toLowerCase());
              
              if (similarity >= 70) { // 70% similarity threshold for first result
                console.log(`Using first result for "${searchTerm}": "${firstResult.title}" (${similarity.toFixed(2)}%)`);
                self.applyStylingIfMatch($elementToStyle, originalText, firstResult.title);
                resolve();
                return;
              }
            }
            
            console.log(`No suitable match found for "${searchTerm}"`);
          } else {
            console.log(`No Wikipedia results for "${searchTerm}"`);
          }
          
          resolve();
        }).fail(function(error) {
          console.error("Wikipedia search error:", error);
          resolve();
        });
      });
    },
    
    wp_searchWikipedia: function(searchTerm) {
      return $.ajax({
        url: this.settings.apiUrl,
        data: {
          action: 'query',
          list: 'search',
          srsearch: searchTerm,
          format: 'json',
          origin: '*'
        },
        dataType: 'json'
      });
    },
    
    applyStylingIfMatch: function($element, originalText, wikipediaTitle) {
      // Apply styling to the element
      $element.addClass(this.settings.linkClass);
      $element.attr(this.settings.dataAttr, wikipediaTitle);
    },
    
    // Initialize Wikipedia Preview after all searches are complete
    initWikipediaPreview: function() {
      if (typeof window.wikipediaPreview !== 'undefined') {
        window.wikipediaPreview.init({
          root: document.body,
          selector: `.${this.settings.linkClass}`,
          detectLinks: false,
          popupContainer: document.body,
          lang: 'en',
          preferredThumbnailWidth: 300,
          theme: 'light',
          showPreview: (el) => {
            return el.getAttribute(this.settings.dataAttr.replace('data-', ''));
          },
          getPreviewOptions: (el) => {
            return {
              title: el.getAttribute(this.settings.dataAttr)
            };
          }
        });
      } else {
        console.error('Wikipedia Preview library not loaded');
      }
    }
  });
  
  // jQuery plugin wrapper
  $.fn.wikipediaSearch = function(options) {
    return this.each(function() {
      if (!$.data(this, 'plugin_wikipediaSearch')) {
        const plugin = new WikipediaSearch(this, options);
        $.data(this, 'plugin_wikipediaSearch', plugin);
        
        // Wait for all searches to complete before initializing Wikipedia Preview
        Promise.all(plugin.searchPromises).then(() => {
          plugin.initWikipediaPreview();
        });
      }
    });
  };
})(jQuery);
