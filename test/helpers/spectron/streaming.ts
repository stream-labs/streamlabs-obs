import { click, focusChild, focusMain, TExecutionContext } from './index';
import { setOutputResolution } from './output';
import { fillForm, FormMonkey, TFormMonkeyData } from '../form-monkey';
import { getClient } from '../api-client';
import { StreamSettingsService } from '../../../app/services/settings/streaming';
import { sleep } from '../sleep';
import { showSettings } from "./settings";
/**
 * Go live and wait for stream start
 */
export async function goLive(t: TExecutionContext, prefillData?: TFormMonkeyData) {
  await tryToGoLive(t, prefillData);
  await waitForStreamStart(t);
}

/**
 * setup settings for running streaming tests in CI
 */
export async function prepareToGoLive(t: TExecutionContext) {
  // set low resolution to prevent intensive CPU usage
  await setOutputResolution(t, '100x100');

  // use legacy goLive components
  await showSettings(t, 'Experimental');
  const form = new FormMonkey(t);
  await form.fill({ legacyGoLive: true });

  // disable warning when trying to start stream without video-sources
  (await getClient())
    .getResource<StreamSettingsService>('StreamSettingsService')
    .setSettings({ warnNoVideoSources: false });
}

/**
 * Simply click the "Go Live" button
 * It opens the EditStreamInfo window or start stream if the conformation dialog has been disabled
 */
export async function clickGoLive(t: TExecutionContext) {
  await focusMain(t);
  await click(t, 'button=Go Live');
  await focusChild(t);
}

/**
 * Fill the form in the EditStreamInfo window and click Go Live
 */
export async function tryToGoLive(t: TExecutionContext, prefillData?: TFormMonkeyData) {
  await prepareToGoLive(t);
  await clickGoLive(t);
  await focusChild(t);

  const $goLive = await t.context.app.client.$('button=Go Live');

  if (await $goLive.isExisting()) await click(t, 'button=Go Live');

  if (prefillData) {
    await fillForm(t, 'form[name=editStreamForm]', prefillData);
  }
  await submit(t);
}

/**
 * Submit EditStreamInfo form in the child window
 */
export async function submit(t: TExecutionContext) {
  const app = t.context.app;
  await (await app.client.$('button=Confirm & Go Live')).waitForEnabled({ timeout: 10000 });
  await click(t, 'button=Confirm & Go Live');
}

export async function waitForStreamStart(t: TExecutionContext) {
  // check we're streaming
  await focusMain(t);
  await (await t.context.app.client.$('button=End Stream')).waitForExist({ timeout: 20 * 1000 });
}

/**
 * Click the "End Stream" button and wait until stream stops
 */
export async function stopStream(t: TExecutionContext) {
  await focusMain(t);
  await click(t, 'button=End Stream');
  await waitForStreamStop(t);
}

export async function waitForStreamStop(t: TExecutionContext) {
  await sleep(2000); // the stream often starts with delay so we have the "Go Live" button visible for a second even we clicked "Start Stream"
  const ms = 40 * 1000; // we may wait for a long time if the stream key is not valid
  await focusMain(t);
  try {
    await (await t.context.app.client.$('button=Go Live')).waitForExist({ timeout: ms });
  } catch (e) {
    throw new Error(`Stream did not stop in ${ms}ms`);
  }
}

export async function chatIsVisible(t: TExecutionContext) {
  await focusMain(t);
  return (await t.context.app.client.$('a=Refresh Chat')).isDisplayed(); // TODO: it's better to check the content of the chat browser-view
}

export async function startRecording(t: TExecutionContext) {
  const client = t.context.app.client;
  await (await client.$('.record-button')).click();
  await (await client.$('.record-button.active')).waitForDisplayed();
}

export async function stopRecording(t: TExecutionContext) {
  const client = t.context.app.client;
  await (await client.$('.record-button')).click();
  await (await client.$('.record-button:not(.active)')).waitForDisplayed({ timeout: 15000 });
}

/**
 * Open liveDock and edit stream settings
 */
export async function updateChannelSettings(t: TExecutionContext, prefillData?: TFormMonkeyData) {
  await click(t, '.live-dock'); // open LiveDock
  await click(t, '.icon-edit'); // click Edit
  await focusChild(t);
  await fillForm(t, null, prefillData);
  await click(t, 'button=Update');
  await (await t.context.app.client.$('div=Successfully updated')).waitForDisplayed();
}
