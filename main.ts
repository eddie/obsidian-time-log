import moment from 'moment';
import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	debounce,
} from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';

// TODO: Document property toggle for enable
// TODO: Automatic / Manual mode -> shortcuts.
// TODO: Extract the header logic tests e.g log vs date
// NOTE: If list mode, we only replace on the bullet- not gaps between

interface TimelogSettings {
	replacementInterval: number;
	useList: boolean;
	logFormat: string;
	debounceMs: number;
}

const DEFAULT_SETTINGS: TimelogSettings = {
	replacementInterval: 30,
	debounceMs: 500,
	useList: false,
	logFormat: 'HH:mm',
};

export default class TimelogPlugin extends Plugin {
	settings: TimelogSettings;

	dailyNoteFormat?: string;
	lastReplacement?: Date;
	statusBarItemEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		// Watch for changes to intercept log lines
		this.registerEvent(
			this.app.workspace.on(
				'editor-change',
				debounce(
					this.onEditorChange.bind(this),
					this.settings.debounceMs,
					false
				)
			)
		);

		const { format } = getDailyNoteSettings();
		this.dailyNoteFormat = format;

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText(
			`Logging Active ${this.settings.replacementInterval}s`
		);

		// Start new logging day
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Start Log Entry',
			editorCallback: (editor: Editor) => {
				if (this.dailyNoteFormat) {
					const date = moment().format(this.dailyNoteFormat);
					editor.replaceSelection(`## [[${date}]]\n\n`);
				} else {
					editor.replaceSelection(`## Log \n\n`);
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TimelogSettingTab(this.app, this));
	}

	onEditorChange(editor: Editor, view: MarkdownView) {
		// Determine if we are in the
		if (this.isInsideLogConext(editor)) {
			// Append a line below current cursor
			if (this.insertLogLine(editor)) {
				this.lastReplacement = new Date();
			}
		}
	}

	shouldInsertLogLine(editor: Editor): boolean {}

	insertLogLine(editor: Editor): boolean {
		// Insert a log line below the current line
		const cursor = editor.getCursor();
		let logDate;

		try {
			logDate = moment().format(this.settings.logFormat);
		} catch (e) {
			logDate = moment().format(DEFAULT_SETTINGS.logFormat);
		}

		const logHeader = `**${logDate}**: `;
		const spacing = 2;
		let offset = editor.getLine(cursor.line).indexOf('*');

		// First lets check if we already have some writing here on this line, heuristically
		if (editor.getLine(cursor.line).trim().length > 2) {
			return false;
		}

		if (this.settings.useList && offset < 0) {
			console.info('Not a list item, skipping');
			return false;
		}

		// Account for case where hyphen is found, even at position 0
		if (offset >= 0) {
			offset = offset + spacing;
		} else {
			offset = 0;
		}
		editor.replaceRange(logHeader, { line: cursor.line, ch: offset });
		editor.setCursor({
			line: cursor.line,
			ch: cursor.ch + logHeader.length,
		});

		return true;
	}

	isInsideLogConext(editor: Editor) {
		const interval = this.settings.replacementInterval;

		// Determine if last replacement run in past X seconds
		if (
			this.lastReplacement &&
			new Date().getTime() - this.lastReplacement.getTime() <
				interval * 1000
		) {
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
		if (this.dailyNoteFormat) {
			const formatHyphens = (this.dailyNoteFormat.match(/-/g) || [])
				.length;
			const actualHyphens = (line.match(/-/g) || []).length;
			return formatHyphens === actualHyphens;
		}
		return line.startsWith('#') && line.toLowerCase().includes('log');
	}

	isNormalHeader(line: string) {
		return line.startsWith('#');
	}

	isLoggedLine(line: string) {
		// Remove all optional spaces and hyphens from start of line
		const l = line
			.replace(/^[-\s]/g, '')
			// Remove formatting
			.replace(/\*/g, '')
			// Now take the substr of the length of the time format
			.substring(0, this.settings.logFormat.length);

		return moment(l, this.settings.logFormat).isValid();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
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

		new Setting(containerEl).setHeading().setName('Timelog Settings');

		new Setting(containerEl)
			.setName('Minimum Log Duration')
			.setDesc(
				'Minimum time in seconds between log entries being prefixed'
			)
			.addSlider((slider) =>
				slider
					.setValue(
						this.plugin.settings.replacementInterval
							? this.plugin.settings.replacementInterval
							: 60
					)
					.setLimits(1, 180, 1)
					.onChange(async (value) => {
						this.plugin.settings.replacementInterval = value;
						await this.plugin.saveSettings();
					})
					.setDynamicTooltip()
			);

		new Setting(containerEl)
			.setName('Log Format')
			.setDesc('Format of timestamp to prefix log entries e.g HH:MM')
			.addMomentFormat((format) =>
				format
					.setValue(
						this.plugin.settings.logFormat ??
							DEFAULT_SETTINGS.logFormat
					)
					.onChange(async (value) => {
						this.plugin.settings.logFormat = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Use Lists Only')
			.setDesc('Use lists for log entries')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useList)
					.onChange(async (value) => {
						this.plugin.settings.useList = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
