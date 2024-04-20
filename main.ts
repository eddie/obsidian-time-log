import moment from 'moment';
import { App, Editor, MarkdownView, Modal, Plugin, PluginSettingTab, Setting, debounce } from 'obsidian';


// TODO: Add replacementInterval to settings modal.
// TODO: Add format option for log lines
// TODO: Setting to force list or not.
// TODO: Document property toggle for enable
// TODO: Audo header insertion with todays note linked
// TODO: Setting for formatting log titles and detecting

interface TimelogSettings {
	mySetting: string;
	replacementInterval: number;
	useList: boolean;
	dateFormat: string;
}

const DEFAULT_SETTINGS: TimelogSettings = {
	mySetting: 'default',
	replacementInterval: 5,
	useList: false,
	dateFormat: 'HH:MM'
}

export default class TimelogPlugin extends Plugin {
	settings: TimelogSettings;

	lastReplacement?: Date;

	async onload() {
		await this.loadSettings();

		// Watch for changes to intercept log lines
		this.registerEvent(this.app.workspace.on('editor-change',
			debounce(this.onEditorChange.bind(this), 1000, false)
		));

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Logging Active');

		// Start new logging day
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Start Log Entry',
			editorCallback: (editor: Editor) => {
				console.log(editor.getSelection());
				editor.replaceSelection('## Log {date}\n\n');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TimelogSettingTab(this.app, this));
	}

	onEditorChange(editor: Editor, view: MarkdownView) {
		// Determine if we are in the 
		if (this.isInsideLogConext(editor)) {
			// Append a line below current cursor
			this.insertLogLine(editor);
			this.lastReplacement = new Date();
		}
	}

	insertLogLine(editor: Editor) {
		// Insert a log line below the current line
		const cursor = editor.getCursor();
		let logDate;
		try {
			logDate = moment().format(this.settings.dateFormat);
		} catch (e) {
			logDate = moment().format(DEFAULT_SETTINGS.dateFormat)
		}

		const logHeader = `**${logDate}**: `;
		const spacing = 2;
		let offset = editor.getLine(cursor.line).indexOf('-');

		// Account for case where hyphen is found, even at position 0
		if (offset >= 0) {
			offset = offset + spacing;
		} else {
			offset = 0;
		}
		editor.replaceRange(logHeader, { line: cursor.line, ch: offset });
		editor.setCursor({ line: cursor.line, ch: cursor.ch + logHeader.length });
	}

	isInsideLogConext(editor: Editor) {
		const interval = 5 // this.settings.replacementInterval;
		// Determine if last replacement run in past X minutes
		if (this.lastReplacement &&
			(new Date().getTime() - this.lastReplacement.getTime()) < interval * 1000) {
			return false;
		}

		// Determine if any lines between and include the previous header
		// contain the log keyword.
		let currentLine = editor.getCursor().line;
		let line = editor.getLine(currentLine);

		// Don't double log.
		if (this.isLoggedLine(line)) {
			return false;
		}

		// Look for log headers above the current line
		while (currentLine-- > 0) {
			line = editor.getLine(currentLine);
			if (this.isLogHeader(line)) {
				return true;
			} else if (this.isNormalHeader(line)) {
				return false;
			}
		}

		return false;
	}

	isLogHeader(line: string) {
		return line.startsWith('#') && line.toLocaleLowerCase().includes("log");
	}

	isNormalHeader(line: string) {
		return line.startsWith('#');
	}

	isLoggedLine(line: string) {
		// Remove all optional spaces and hyphens from start of line
		const l = line.replace(/^[-\s]/g, '')
			// Remove formatting
			.replace(/\*/g, '')
			// Now take the substr of the length of the time format
			.substring(0, this.settings.dateFormat.length);

		return moment(l, this.settings.dateFormat).isValid();
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TimelogSettingTab extends PluginSettingTab {
	plugin: TimelogPlugin;

	constructor(app: App, plugin: TimelogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setHeading()
			.setName('Timelog Settings');

		new Setting(containerEl)
			.setName('Minimum Log Duration')
			.setDesc('Minimum time in minutes between log entries being prefixed')
			.addSlider(slider => slider.setValue(this.plugin.settings.replacementInterval ? this.plugin.settings.replacementInterval / 60 : 1)
				.setLimits(1, 60, 1)
				.onChange(async (value) => {
					this.plugin.settings.replacementInterval = value * 60;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName('Log Format')
			.setDesc('Format of timestamp to prefix log entries e.g HH:MM')
			.addMomentFormat((format) => format.setValue(this.plugin.settings.dateFormat ?? DEFAULT_SETTINGS.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}))
	}
}
