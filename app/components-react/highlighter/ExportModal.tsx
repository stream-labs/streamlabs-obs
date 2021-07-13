import React, { useState, useEffect } from 'react';
import { EExportStep, TFPS, TResolution, TPreset } from 'services/highlighter';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { FileInput, TextInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import path from 'path';
import { Button, Progress, Alert } from 'antd';
import YoutubeUpload from './YoutubeUpload';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import { confirmAsync } from 'components-react/modals';

export default function ExportModal(p: { close: () => void }) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    exportInfo: HighlighterService.views.exportInfo,
  }));

  // Clear all errors when this component unmounts
  useEffect(() => {
    return () => HighlighterService.actions.dismissError();
  }, []);

  function getExportFileFromVideoName(videoName: string) {
    const parsed = path.parse(v.exportInfo.file);
    return path.join(parsed.dir, `${path.basename(videoName)}${parsed.ext}`);
  }

  function getVideoNameFromExportFile(exportFile: string) {
    return path.parse(exportFile).name;
  }

  // Video name and export file are kept in sync
  const [videoName, setVideoName] = useState('My Video');
  const [exportFile, setExportFile] = useState<string>(getExportFileFromVideoName(videoName));

  // TODO: Give warning overwriting
  // TODO: Show confirm when closing modal after export

  function getFileExportStep() {
    return (
      <div>
        <h2>Export Video</h2>
        <Form>
          <TextInput
            label="Video Name"
            value={videoName}
            onInput={name => {
              setVideoName(name);
              setExportFile(getExportFileFromVideoName(name));
            }}
            uncontrolled={false}
          />
          <FileInput
            label="Export Location"
            save={true}
            filters={[{ name: 'MP4 Video File', extensions: ['mp4'] }]}
            value={exportFile}
            onChange={file => {
              setExportFile(file);
              setVideoName(getVideoNameFromExportFile(file));
            }}
          />
          <RadioInput
            label="Resolution"
            value={v.exportInfo.resolution.toString()}
            options={[
              { value: '720', label: '720p' },
              { value: '1080', label: '1080p' },
            ]}
            onChange={val => {
              HighlighterService.actions.setResolution(parseInt(val, 10) as TResolution);
            }}
            buttons={true}
          />
          <RadioInput
            label="Frame Rate"
            value={v.exportInfo.fps.toString()}
            options={[
              { value: '30', label: '30 FPS' },
              { value: '60', label: '60 FPS' },
            ]}
            onChange={val => {
              HighlighterService.actions.setFps(parseInt(val, 10) as TFPS);
            }}
            buttons={true}
          />
          <RadioInput
            label="File Size"
            value={v.exportInfo.preset}
            options={[
              { value: 'ultrafast', label: 'Faster Export' },
              { value: 'fast', label: 'Balanced' },
              { value: 'slow', label: 'Smaller File' },
            ]}
            onChange={val => {
              HighlighterService.actions.setPreset(val as TPreset);
            }}
            buttons={true}
          />
          {v.exportInfo.error && (
            <Alert
              style={{ marginBottom: 24 }}
              message={v.exportInfo.error}
              type="error"
              closable
              showIcon
              afterClose={() => HighlighterService.actions.dismissError()}
            />
          )}
          <div style={{ textAlign: 'right' }}>
            <Button style={{ marginRight: 8 }} onClick={p.close}>
              Close
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                if (await HighlighterService.actions.return.fileExists(exportFile)) {
                  if (
                    !(await confirmAsync({
                      title: 'Overwite File?',
                      content: `${path.basename(
                        exportFile,
                      )} already exists. Would you like to overwrite it?`,
                      okText: 'Overwrite',
                    }))
                  ) {
                    return;
                  }
                }

                UsageStatisticsService.actions.recordFeatureUsage('HighlighterExport');

                HighlighterService.actions.setExportFile(exportFile);
                HighlighterService.actions.export();
              }}
            >
              Export
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  function getExportProgress() {
    return (
      <div>
        <h2>Export Progress</h2>
        <Progress
          percent={Math.round((v.exportInfo.currentFrame / v.exportInfo.totalFrames) * 100)}
          trailColor="var(--section)"
          status={v.exportInfo.cancelRequested ? 'exception' : 'normal'}
        />
        {!v.exportInfo.cancelRequested && v.exportInfo.step === EExportStep.FrameRender && (
          <div>
            Rendering Frames: {v.exportInfo.currentFrame}/{v.exportInfo.totalFrames}
          </div>
        )}
        {!v.exportInfo.cancelRequested && v.exportInfo.step === EExportStep.AudioMix && (
          <div>
            Mixing Audio:
            <i className="fa fa-pulse fa-spinner" style={{ marginLeft: '12px' }} />
          </div>
        )}
        {v.exportInfo.cancelRequested && <span>Canceling...</span>}
        <br />
        <button
          className="button button--soft-warning"
          onClick={() => HighlighterService.actions.cancelExport()}
          style={{ marginTop: '16px' }}
          disabled={v.exportInfo.cancelRequested}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (v.exportInfo.exporting) return getExportProgress();
  if (!v.exportInfo.exported) return getFileExportStep();
  return <YoutubeUpload defaultTitle={videoName} close={p.close} />;
}
