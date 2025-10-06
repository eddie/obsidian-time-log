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
					false,
				),
			),
		);

		const { format } = getDailyNoteSettings();
		this.dailyNoteFormat = format;

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText(
			`Logging active ${this.settings.replacementInterval}s`,
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
		if (!this.shouldInsertLine(editor)) {
			return;
		}
		this.insertLogLine(editor);
	}

	/** 
	 * Inserts a log line into the editor at the current cursor position
	 * 
	*/
	insertLogLine(editor: Editor): boolean {
		const cursor = editor.getCursor();
		const logPrefix = this.getFormattedLogPrefix();
		const logHeader = `**${logPrefix}**: `;
		const line = editor.getLine(cursor.line);
		let offset = line.indexOf('*') + 2;

		editor.replaceRange(logHeader, { line: cursor.line, ch: offset });
		editor.setCursor({
			line: cursor.line,
			ch: cursor.ch + logHeader.length,
		});
		this.lastReplacement = new Date();

		return true;
	}

	getFormattedLogPrefix() {
		try {
			return moment().format(this.settings.logFormat);
		} catch (e) {
			return moment().format(DEFAULT_SETTINGS.logFormat);
		}
	}

	shouldInsertLine(editor: Editor) {

		if (!this.isWithinInterval()) {
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

		const hasList = line.trim().startsWith('*');
		const isNested = line.startsWith('\t');

		if (this.settings.useList) {
			// Obsidian has completed italics/bold for us so wait.
			if (line.indexOf('**') === 0) {
				return false;
			}
			// TODO: add setting for nesting level.
			// we would then log by minute & Second to avoid collisions.
			if (isNested) {
				return false;
			}
			if (!hasList) {
				return false;
			}
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

	// Determine if last replacement run in past X seconds
	isWithinInterval() {
		const interval = this.settings.replacementInterval;

		if (
			this.lastReplacement &&
			new Date().getTime() - this.lastReplacement.getTime() <
			interval * 1000
		) {
			return false;
		}
		return true;
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

	onunload() { }

	// findMostRecentHeader(editor: Editor, lineNumber: number) {
	// 	let currentLine = lineNumber;
	// 	while (currentLine > 0) {
	// 		const line = editor.getLine(currentLine);
	// 		if (this.isLogHeader(line)) {
	// 			return line;
	// 		}
	// 		currentLine--;
	// 	}
	// 	return null;
	// }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
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
				'Minimum time in seconds between log entries being prefixed',
			)
			.addSlider((slider) =>
				slider
					.setValue(
						this.plugin.settings.replacementInterval
							? this.plugin.settings.replacementInterval
							: 60,
					)
					.setLimits(1, 180, 1)
					.onChange(async (value) => {
						this.plugin.settings.replacementInterval = value;
						await this.plugin.saveSettings();
					})
					.setDynamicTooltip(),
			);

		new Setting(containerEl)
			.setName('Log Format')
			.setDesc('Format of timestamp to prefix log entries e.g HH:MM')
			.addMomentFormat((format) =>
				format
					.setValue(
						this.plugin.settings.logFormat ??
						DEFAULT_SETTINGS.logFormat,
					)
					.onChange(async (value) => {
						this.plugin.settings.logFormat = value;
						await this.plugin.saveSettings();
					}),
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
					}),
			);
	}
}
