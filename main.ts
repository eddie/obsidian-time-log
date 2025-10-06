import moment from 'moment';
import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	debounce,
} from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';


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

const DEFAULT_HEADER_FORMAT = 'YYYY-MM-DD';

export default class TimelogPlugin extends Plugin {
	settings: TimelogSettings;

	dailyNoteFormat: string = DEFAULT_HEADER_FORMAT;
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

		const dailySettings = getDailyNoteSettings();
		this.dailyNoteFormat = dailySettings?.format ?? DEFAULT_HEADER_FORMAT;

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.style.display = 'none';
		this.updateStatusBar();

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateStatusBar();
			}),
		);

		// Start new logging day
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Start Log Entry',
			editorCallback: (editor: Editor) => {
				const date = moment().format(this.dailyNoteFormat);
				editor.replaceSelection(`## [[${date}]]\n\n`);
				this.updateStatusBar(editor);
			},
		});

		this.addCommand({
			id: 'jump-to-latest-log-header',
			name: 'Jump to Latest Log Header',
			editorCallback: (editor: Editor) => {
				const targetLine = this.findLatestDatedHeader(editor);
				if (targetLine === null) {
					new Notice('No dated headers found');
					return;
				}

				const desiredLine = targetLine + 1;
				if (desiredLine >= editor.lineCount()) {
					const headerText = editor.getLine(targetLine);
					editor.replaceRange('\n', {
						line: targetLine,
						ch: headerText.length,
					});
				}

				const cursorLine = Math.min(targetLine + 1, editor.lineCount() - 1);
				const cursor = { line: cursorLine, ch: 0 };
				editor.setCursor(cursor);
				editor.scrollIntoView({ from: cursor, to: cursor }, true);
			},
		});

		this.addSettingTab(new TimelogSettingTab(this.app, this));
	}

	onEditorChange(editor: Editor, view: MarkdownView) {
		this.updateStatusBar(editor);
		if (!this.shouldInsertLine(editor)) {
			return;
		}
		this.insertLogLine(editor);
	}

	/** 
	 * Inserts a log line into the editor at the current cursor position
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

	findLatestDatedHeader(editor: Editor): number | null {
		let latestLine: number | null = null;
		let latestDate: moment.Moment | null = null;
		const lines = editor.lineCount();

		for (let lineNumber = 0; lineNumber < lines; lineNumber++) {
			const parsed = this.extractHeaderDate(editor.getLine(lineNumber));
			if (!parsed) {
				continue;
			}

			if (!latestDate || parsed.isAfter(latestDate)) {
				latestDate = parsed;
				latestLine = lineNumber;
			}
		}

		return latestLine;
	}

	extractHeaderDate(line: string): moment.Moment | null {
		const trimmed = line.trim();
		if (!trimmed.startsWith('#')) {
			return null;
		}

		const content = trimmed.replace(/^#+\s*/, '').trim();
		const linkMatch = content.match(/\[\[(.+?)\]\]/);
		const linkContent = linkMatch ? linkMatch[1] : content;
		const dateText = linkContent.split('|')[0];
		const parsed = moment(dateText, this.dailyNoteFormat, true);

		return parsed.isValid() ? parsed : null;
	}

	updateStatusBar(editor?: Editor) {
		if (!this.statusBarItemEl) {
			return;
		}

		const activeEditor = editor ?? this.getActiveEditor();
		if (!activeEditor || !this.hasDatedHeader(activeEditor)) {
			this.statusBarItemEl.style.display = 'none';
			return;
		}

		this.statusBarItemEl.style.display = '';
		this.statusBarItemEl.setText(
			`Logging active ${this.settings.replacementInterval}s`,
		);
	}

	getActiveEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor ?? null;
	}

	hasDatedHeader(editor: Editor): boolean {
		const lines = editor.lineCount();
		for (let lineNumber = 0; lineNumber < lines; lineNumber++) {
			if (this.extractHeaderDate(editor.getLine(lineNumber))) {
				return true;
			}
		}
		return false;
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
		return this.extractHeaderDate(line) !== null;
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
						this.plugin.updateStatusBar();
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
						this.plugin.updateStatusBar();
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
						this.plugin.updateStatusBar();
					}),
			);
	}
}
