import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

// Map conventional commit types to Keep a Changelog sections
const TYPE_MAPPING = {
    feat: 'Added',
    fix: 'Fixed',
    docs: 'Documentation',
    style: 'Changed',
    refactor: 'Changed',
    perf: 'Changed',
    test: 'Changed',
    chore: 'Changed',
    build: 'Changed',
    ci: 'Changed',
    revert: 'Changed',
};

function getLogMessage() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: npm run log "type: message"');
        process.exit(1);
    }
    return args.join(' ');
}

function parseMessage(fullMessage) {
    const match = fullMessage.match(/^([a-z]+)(\(.*\))?: (.+)$/);
    if (!match) {
        // Default to 'Changed' if no type is specified
        return { type: 'Changed', content: fullMessage };
    }
    const type = match[1];
    const content = match[3];
    const section = TYPE_MAPPING[type] || 'Changed';
    return { type: section, content };
}

function updateChangelog() {
    try {
        if (!fs.existsSync(CHANGELOG_PATH)) {
            console.error(`ERROR: CHANGELOG.md not found at ${CHANGELOG_PATH}`);
            process.exit(1);
        }

        let content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
        const { type, content: logContent } = parseMessage(getLogMessage());
        const entry = `- ${logContent}`;

        // Find [Unreleased] section
        const unreleasedRegex = /## \[Unreleased\]/;
        if (!content.match(unreleasedRegex)) {
            // If no Unreleased section, add it after header
            const headerEnd = content.indexOf('\n\n');
            if (headerEnd !== -1) {
                content = content.slice(0, headerEnd + 2) + '## [Unreleased]\n\n' + content.slice(headerEnd + 2);
            } else {
                content += '\n\n## [Unreleased]\n';
            }
        }

        // Find the specific type subsection under [Unreleased]
        // We need to look for `### Type` after `## [Unreleased]` but before the next `## [`

        const unreleasedIndex = content.search(unreleasedRegex);
        const nextVersionIndex = content.indexOf('\n## [', unreleasedIndex + 1);

        let unreleasedSection = nextVersionIndex === -1
            ? content.substring(unreleasedIndex)
            : content.substring(unreleasedIndex, nextVersionIndex);

        const typeHeader = `### ${type}`;

        if (unreleasedSection.includes(typeHeader)) {
            // Section exists, append to it
            // We look for the section header, then find the end of the list or the next section
            const typeIndexInSub = unreleasedSection.indexOf(typeHeader);
            // Find the start of the next section (### Something) AFTER the current type
            const nextSectionMatch = unreleasedSection.substring(typeIndexInSub + typeHeader.length).match(/\n### /);
            const endOfTypeSection = nextSectionMatch ? (typeIndexInSub + typeHeader.length + nextSectionMatch.index) : -1;

            // Insert before the next sub-section, or at the end of the unreleased section
            if (endOfTypeSection !== -1) {
                // There is another section after this one
                const insertionPoint = unreleasedIndex + endOfTypeSection;
                content = content.slice(0, insertionPoint) + `${entry}\n` + content.slice(insertionPoint);
            } else {
                // It's the last section in Unreleased
                const insertionPoint = nextVersionIndex === -1 ? content.length : nextVersionIndex;
                // Ensure we have a newline before appending if needed
                if (content[insertionPoint - 1] !== '\n') {
                    content = content.slice(0, insertionPoint) + `\n${entry}\n` + content.slice(insertionPoint);
                } else {
                    content = content.slice(0, insertionPoint) + `${entry}\n` + content.slice(insertionPoint);
                }
            }
        } else {
            // Section does not exist, create it under [Unreleased]
            // Insert nicely
            const insertionPoint = unreleasedIndex + '## [Unreleased]'.length;
            content = content.slice(0, insertionPoint) + `\n\n${typeHeader}\n${entry}` + content.slice(insertionPoint);
        }

        fs.writeFileSync(CHANGELOG_PATH, content, 'utf8');
        console.log(`Added to CHANGELOG.md under [Unreleased] -> ${type}`);
    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

updateChangelog();
