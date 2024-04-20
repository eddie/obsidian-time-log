import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, debounce } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	replacementInterval: number
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	replacementInterval: 5
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	lastReplacement?: Date;

	async onload() {
		await this.loadSettings();

		// Watch for changes to intercept log lines
		this.registerEvent(this.app.workspace.on('editor-change',
			debounce(this.onEditorChange.bind(this), 1000, true)
		));

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Logging Active');

		// Start new logging day
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Start Log Entry',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('## Log {date}\n\n');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
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
		const logDate = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
		const logHeader = `- **${logDate}**: `;

		editor.replaceRange(logHeader, { line: cursor.line, ch: 0 });
		editor.setCursor({ line: cursor.line, ch: cursor.ch + logHeader.length });
	}

	isInsideLogConext(editor: Editor) {
		// Determine if last replacement run in past X minutes
		if (this.lastReplacement && (new Date().getTime() - this.lastReplacement.getTime()) < this.settings.replacementInterval * 1000) {
			return false;
		}

		// Determine if any lines between and include the previous header
		// contain the log keyword.
		let currentLine = editor.getCursor().line;
		let line = editor.getLine(currentLine);

		// Don't double log.
		if (this.isLogHeader(line)) {
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

	isOnLoggedLine(line: string) {
		// Does line start with - **HH:MM**:? 
		const timeRegex = /- \*\*\d{1,2}:\d{2}\*\*: /;
		return timeRegex.test(line);
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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
