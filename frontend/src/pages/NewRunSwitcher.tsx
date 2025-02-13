import React from 'react';
import { useQuery } from 'react-query';
import { QUERY_PARAMS } from 'src/components/Router';
import { isFeatureEnabled, FeatureKey } from 'src/features';
import { Apis } from 'src/lib/Apis';
import { NamespaceContext } from 'src/lib/KubeflowClient';
import { URLParser } from 'src/lib/URLParser';
import { NewRun } from './NewRun';
import NewRunV2 from './NewRunV2';
import { PageProps } from './Page';
import { isTemplateV2 } from 'src/lib/v2/WorkflowUtils';
import { ApiPipeline, ApiPipelineVersion } from 'src/apis/pipeline';
import { ApiRunDetail } from 'src/apis/run';

function NewRunSwitcher(props: PageProps) {
  const namespace = React.useContext(NamespaceContext);

  const urlParser = new URLParser(props);
  // Currently using two query parameters to get Run ID.
  // because v1 has two different behavior with Run ID (clone a run / start a run)
  // Will keep clone run only in v2 if run ID is existing
  // runID query by cloneFromRun will be deprecated once v1 is deprecated.
  const originalRunId = urlParser.get(QUERY_PARAMS.cloneFromRun);
  const embeddedRunId = urlParser.get(QUERY_PARAMS.fromRunId);
  const pipelineId = urlParser.get(QUERY_PARAMS.pipelineId);
  const pipelineVersionIdParam = urlParser.get(QUERY_PARAMS.pipelineVersionId);
  const existingRunId = originalRunId ? originalRunId : embeddedRunId;

  const { isSuccess: runIsSuccess, isFetching: runIsFetching, data: apiRun } = useQuery<
    ApiRunDetail
  >(
    ['ApiRun', existingRunId],
    () => {
      if (!existingRunId) {
        throw new Error('Run ID is missing');
      }
      return Apis.runServiceApi.getRun(existingRunId);
    },
    { staleTime: Infinity },
  );
  const templateStrFromRunId = apiRun ? apiRun.run?.pipeline_spec?.pipeline_manifest : '';

  const { isFetching: pipelineIsFetching, data: apiPipeline } = useQuery<ApiPipeline, Error>(
    ['ApiPipeline', pipelineId],
    () => {
      if (!pipelineId) {
        throw new Error('Pipeline ID is missing');
      }
      return Apis.pipelineServiceApi.getPipeline(pipelineId);
    },
    { enabled: !!pipelineId, staleTime: Infinity },
  );

  const { isFetching: pipelineVersionIsFetching, data: apiPipelineVersion } = useQuery<
    ApiPipelineVersion,
    Error
  >(
    ['ApiPipelineVersion', apiPipeline, pipelineVersionIdParam],
    () => {
      const pipelineVersionId = pipelineVersionIdParam || apiPipeline?.default_version?.id;
      if (!pipelineVersionId) {
        throw new Error('Pipeline Version ID is missing');
      }
      return Apis.pipelineServiceApi.getPipelineVersion(pipelineVersionId);
    },
    { enabled: !!apiPipeline, staleTime: Infinity },
  );

  const {
    isSuccess: isTemplatePullSuccessFromPipeline,
    isFetching: pipelineTemplateStrIsFetching,
    data: templateStrFromPipelineId,
  } = useQuery<string, Error>(
    ['ApiPipelineVersionTemplate', apiPipeline, pipelineVersionIdParam],
    async () => {
      const pipelineVersionId = apiPipelineVersion?.id;
      if (!pipelineVersionId) {
        return '';
      }
      const template = await Apis.pipelineServiceApi.getPipelineVersionTemplate(pipelineVersionId);
      return template?.template || '';
    },
    { enabled: !!apiPipelineVersion, staleTime: Infinity },
  );

  const templateString =
    templateStrFromRunId === '' ? templateStrFromPipelineId : templateStrFromRunId;

  if (isFeatureEnabled(FeatureKey.V2_ALPHA)) {
    if ((runIsSuccess || isTemplatePullSuccessFromPipeline) && isTemplateV2(templateString || '')) {
      return (
        <NewRunV2
          {...props}
          namespace={namespace}
          existingRunId={existingRunId}
          apiRun={apiRun}
          apiPipeline={apiPipeline}
          apiPipelineVersion={apiPipelineVersion}
          templateString={templateString}
        />
      );
    }
  }

  if (
    runIsFetching ||
    pipelineIsFetching ||
    pipelineVersionIsFetching ||
    pipelineTemplateStrIsFetching
  ) {
    return <div>Currently loading pipeline information</div>;
  }
  return <NewRun {...props} namespace={namespace} />;
}

export default NewRunSwitcher;
