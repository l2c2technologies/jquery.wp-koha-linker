# jQuery Wikipedia Search Plugin for Koha

A jQuery plugin that enhances Koha OPAC detail pages by linking names and subjects to Wikipedia articles with preview popups.

## Features

- Automatically detects names, subjects, years, and acronyms in Koha catalog records
- Links detected entities to relevant Wikipedia articles
- Provides Wikipedia preview popups on hover using Wikipedia Preview library
- Handles complex name formats and subject headings with multiple components
- Uses fuzzy matching for better accuracy in entity recognition

## Warning

- this is a beta release, hence buggy at times.
- some results will be completely crazy, but hey! you probably get to learn about something you didn't even plan on reading :smirk:

## Installation

### 1. Copy over the code from jquery-wikipedia-koha-linker.js into OPACUserJS.

### 2. Next initialize the plugin and load [wikipedia-preview](https://github.com/wikimedia/wikipedia-preview) via:

```javascript
$(document).ready(function () {

});
```

## How It Works

1. The plugin scans the Koha OPAC detail page for names and subjects
2. It searches Wikipedia for matching articles
3. When matches are found, elements are enhanced with links to Wikipedia
4. Wikipedia Preview provides popup previews when users hover over the links

## Requirements

- Koha ILS (tested on 24.05.x)
- [Wikipedia Preview library](https://github.com/wikimedia/wikipedia-preview)

## License

GNU General Public License v3.0 or later

## Author

Indranil Das Gupta <indradg@l2c2.co.in>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
