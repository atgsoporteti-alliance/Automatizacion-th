'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileUp,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import {
  calculateAge,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  HABEAS_DATA_POLICY_TEXT,
  HABEAS_DATA_POLICY_VERSION,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  SHIRT_SIZES,
  ShirtSize,
  UploadedDocumentInput,
  wizardStep1Schema,
  wizardStep2Schema,
  wizardStep3Schema,
  wizardStep4Schema,
  wizardStep5Schema,
} from '@alliance-hcm/shared';
import { apiClient, DuplicateCheckResponse } from '@/lib/api';
import { DocumentPreviewModal } from './document-preview-modal';
import { SignaturePad } from './signature-pad';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Select,
} from './ui/primitives';

interface WizardFormValues {
  // Paso 1
  fullName: string;
  preferredNameCredentials: string;
  nationalId: string;
  idIssuePlace: string;
  birthDate: string;
  birthPlace: string;
  maritalStatus: (typeof MARITAL_STATUSES)[number];
  // Paso 2
  address: string;
  neighborhoodCity: string;
  phone: string;
  personalEmail: string;
  hasChildren: boolean;
  childrenCount: number;
  shirtSize: ShirtSize;
  // Paso 3
  educationLevel: (typeof EDUCATION_LEVELS)[number];
  lastAcademicTitle: string;
  // Paso 4
  eps: string;
  pensionFund: string;
  severanceFund: string;
  hasBancolombiaAccount: boolean;
  // Paso 5
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  habeasDataAccepted: boolean;
  signatureDataUrl: string;
  otpCode: string;
}

const STEPS = [
  { number: 1, title: 'Identificación y Datos Personales' },
  { number: 2, title: 'Ubicación, Contacto y Dotación' },
  { number: 3, title: 'Formación Académica' },
  { number: 4, title: 'Seguridad Social y Banco' },
  { number: 5, title: 'Emergencia, Ley 1581 y Firma OTP' },
];

const DRAFT_KEY_PREFIX = 'alliance-hcm-preonboarding-draft-';

export function PreOnboardingWizard({ token }: { token: string }) {
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [tokenState, setTokenState] = useState<'VERIFYING' | 'VALID' | 'INVALID'>('VERIFYING');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [invitedCandidateName, setInvitedCandidateName] = useState<string | null>(null);
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const [correctionNote, setCorrectionNote] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResponse | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocumentInput[]>([]);
  const [previewUrls, setPreviewUrls] = useState<
    Record<string, { objectUrl: string; fileName: string; mimeType: string; fileSize: number }>
  >({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [activePreview, setActivePreview] = useState<{
    fileName: string;
    mimeType: string;
    objectUrl: string;
  } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [otpSentInfo, setOtpSentInfo] = useState<{ sent: boolean; devOtp?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    employeeId: string;
    workflowId: string;
    isRehire: boolean;
    computedAge: number;
    consentReceipt: { documentSha256Hash: string; policyVersion: string };
  } | null>(null);

  const form = useForm<WizardFormValues>({
    defaultValues: {
      fullName: '',
      preferredNameCredentials: '',
      nationalId: '',
      idIssuePlace: '',
      birthDate: '',
      birthPlace: '',
      maritalStatus: 'SOLTERO',
      address: '',
      neighborhoodCity: '',
      phone: '',
      personalEmail: '',
      hasChildren: false,
      childrenCount: 0,
      shirtSize: 'M',
      educationLevel: 'PROFESIONAL',
      lastAcademicTitle: '',
      eps: '',
      pensionFund: '',
      severanceFund: '',
      hasBancolombiaAccount: false,
      emergencyContactName: '',
      emergencyContactRelationship: '',
      emergencyContactPhone: '',
      habeasDataAccepted: false,
      signatureDataUrl: '',
      otpCode: '',
    },
  });

  const watchedValues = form.watch();
  const computedAge = watchedValues.birthDate ? calculateAge(watchedValues.birthDate) : 0;

  // Validar Magic Link JWT contra el backend al cargar
  useEffect(() => {
    let active = true;
    setTokenState('VERIFYING');
    apiClient
      .verifyMagicLink(token)
      .then((res) => {
        if (!active) return;
        setTokenState('VALID');
        setInvitedCandidateName(res.candidateName || null);

        if (res.isCorrection && res.prefillData) {
          setIsCorrectionMode(true);
          setCorrectionNote(res.correctionNote ?? 'Talento Humano solicitó corrección de datos.');
          const current = form.getValues();
          form.reset({
            ...current,
            ...(res.prefillData as Partial<WizardFormValues>),
            habeasDataAccepted: false,
            signatureDataUrl: '',
            otpCode: '',
          });
          if (res.existingDocuments && res.existingDocuments.length > 0) {
            setDocuments(
              res.existingDocuments.map((d) => ({
                documentType: d.documentType as UploadedDocumentInput['documentType'],
                fileName: d.fileName,
                mimeType: d.mimeType,
                fileSize: d.fileSize,
                s3Key: d.s3Key,
                s3Url: d.s3Url,
              })),
            );
          }
          setMaxStepReached(5);
        } else {
          const current = form.getValues();
          form.reset({
            ...current,
            fullName:
              current.fullName ||
              (res.candidateName && res.candidateName !== 'Candidato Demo Alliance'
                ? res.candidateName
                : ''),
            personalEmail: current.personalEmail || res.candidateEmail || '',
            nationalId: current.nationalId || res.nationalId || '',
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        setTokenState('INVALID');
        setTokenError(
          err instanceof Error
            ? err.message
            : 'El enlace seguro de pre-ingreso es inválido o ha expirado.',
        );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Cargar borrador guardado automáticamente
  useEffect(() => {
    const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${token}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<WizardFormValues>;
        form.reset({ ...form.getValues(), ...parsed });
      } catch {
        // ignore corrupted draft
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Autoguardado de borrador cada vez que cambia el formulario
  useEffect(() => {
    const timeout = setTimeout(() => {
      window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${token}`, JSON.stringify(watchedValues));
      setDraftSavedAt(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
    }, 600);
    return () => clearTimeout(timeout);
  }, [watchedValues, token]);

  // Validación en tiempo real de cédula sin duplicados / detección de reintegros
  useEffect(() => {
    const nationalId = watchedValues.nationalId?.trim();
    if (!nationalId || nationalId.length < 6) {
      setDuplicateCheck(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const result = await apiClient.checkDuplicate(nationalId, watchedValues.personalEmail);
        setDuplicateCheck(result);
      } catch {
        setDuplicateCheck(null);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [watchedValues.nationalId, watchedValues.personalEmail]);

  const handleFileUpload = async (
    file: File | null,
    documentType: UploadedDocumentInput['documentType'],
  ) => {
    if (!file) return;
    setUploadingDoc(documentType);
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[documentType];
      return next;
    });

    const localObjectUrl = URL.createObjectURL(file);
    const mimeType = file.type || 'application/pdf';
    setPreviewUrls((prev) => ({
      ...prev,
      [documentType]: {
        objectUrl: localObjectUrl,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
      },
    }));

    try {
      const uploaded = await apiClient.uploadPreOnboardingFile(
        file,
        documentType,
        watchedValues.nationalId || undefined,
      );

      setDocuments((prev) => [
        ...prev.filter((d) => d.documentType !== documentType),
        {
          documentType,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
          s3Key: uploaded.s3Key,
          s3Url: uploaded.s3Url,
        },
      ]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error subiendo el archivo al bucket de Supabase.';
      setUploadErrors((prev) => ({ ...prev, [documentType]: msg }));
    } finally {
      setUploadingDoc(null);
    }
  };

  const renderInlinePreviewCard = (
    documentType: UploadedDocumentInput['documentType'],
  ) => {
    const local = previewUrls[documentType];
    const uploaded = documents.find((d) => d.documentType === documentType);
    const errMsg = uploadErrors[documentType];

    if (!local && !uploaded && !errMsg) return null;

    const fileName = uploaded?.fileName ?? local?.fileName ?? 'archivo';
    const mimeType = uploaded?.mimeType ?? local?.mimeType ?? 'application/pdf';
    const fileSizeKb = Math.max(1, Math.round((uploaded?.fileSize ?? local?.fileSize ?? 0) / 1024));
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5 dark:border-slate-800 dark:bg-slate-950">
        {local && (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={local.objectUrl}
                alt={fileName}
                className="h-32 w-full object-contain p-1"
              />
            ) : isPdf ? (
              <iframe
                src={local.objectUrl}
                title={fileName}
                className="h-36 w-full bg-white"
              />
            ) : (
              <div className="flex h-20 items-center justify-center text-xs text-slate-500">
                Archivo listo ({fileName})
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="font-semibold truncate text-slate-800 dark:text-slate-200">{fileName}</p>
            <p className="text-[11px] text-slate-500">
              {fileSizeKb} KB ·{' '}
              {uploaded ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Guardado en Supabase (alliance)
                </span>
              ) : errMsg ? (
                <span className="text-rose-600 dark:text-rose-400">Error al subir a nube</span>
              ) : (
                'Subiendo...'
              )}
            </p>
          </div>

          {local && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setActivePreview({
                    fileName,
                    mimeType,
                    objectUrl: local.objectUrl,
                  })
                }
              >
                <Eye className="h-3.5 w-3.5" />
                Ampliar
              </Button>
              <a
                href={local.objectUrl}
                download={fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </a>
            </div>
          )}
        </div>

        {errMsg && (
          <div className="rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            {errMsg}
          </div>
        )}
      </div>
    );
  };

  const handleSendOtp = async () => {
    if (!watchedValues.personalEmail) {
      setSubmitError('Ingresa primero tu correo electrónico personal en el Paso 2 para enviar el OTP.');
      return;
    }
    setSubmitError(null);
    try {
      const res = await apiClient.sendOtp(watchedValues.personalEmail, watchedValues.phone);
      setOtpSentInfo(res);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo enviar el código OTP.');
    }
  };

  const validateStep = (targetStep: number): string[] => {
    const v = form.getValues();
    const errors: string[] = [];

    if (targetStep === 1) {
      const parsed = wizardStep1Schema.safeParse(v);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((i) => i.message));
      }
      if (v.birthDate && calculateAge(v.birthDate) < 14) {
        errors.push('La fecha de nacimiento debe corresponder a una edad válida (mínimo 14 años).');
      }
      if (!isCorrectionMode && duplicateCheck?.exists && !duplicateCheck.isRehire) {
        errors.push(duplicateCheck.message);
      }
    } else if (targetStep === 2) {
      const parsed = wizardStep2Schema.safeParse({
        ...v,
        childrenCount: v.hasChildren ? Number(v.childrenCount || 0) : 0,
      });
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((i) => i.message));
      }
    } else if (targetStep === 3) {
      const parsed = wizardStep3Schema.safeParse(v);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((i) => i.message));
      }
      if (!documents.some((d) => d.documentType === 'NATIONAL_ID_PDF')) {
        errors.push('Debes adjuntar el PDF o imagen de tu Cédula de Ciudadanía.');
      }
      if (!documents.some((d) => d.documentType === 'ACADEMIC_CERTIFICATE')) {
        errors.push('Debes adjuntar el soporte de tu Diploma o Acta de Grado.');
      }
    } else if (targetStep === 4) {
      const parsed = wizardStep4Schema.safeParse(v);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((i) => i.message));
      }
      if (
        v.hasBancolombiaAccount &&
        !documents.some((d) => d.documentType === 'BANK_CERTIFICATE')
      ) {
        errors.push('Si tienes cuenta Bancolombia, debes adjuntar tu Certificación Bancaria.');
      }
    } else if (targetStep === 5) {
      const parsed = wizardStep5Schema.safeParse(v);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((i) => i.message));
      }
    }

    return Array.from(new Set(errors));
  };

  const handleNextStep = () => {
    const errors = validateStep(step);
    if (errors.length > 0) {
      setStepErrors(errors);
      return;
    }
    setStepErrors([]);
    const next = Math.min(5, step + 1);
    setStep(next);
    setMaxStepReached((prev) => Math.max(prev, next));
  };

  const handleSelectStepTab = (targetStep: number) => {
    if (targetStep === step) return;
    if (targetStep < step || targetStep <= maxStepReached) {
      // Si intenta avanzar, validar todos los pasos intermedios primero
      if (targetStep > step) {
        for (let s = step; s < targetStep; s++) {
          const errs = validateStep(s);
          if (errs.length > 0) {
            setStep(s);
            setStepErrors(errs);
            return;
          }
        }
      }
      setStepErrors([]);
      setStep(targetStep);
    }
  };

  const onSubmit = async (values: WizardFormValues) => {
    setSubmitError(null);
    const allErrors: string[] = [];
    for (let s = 1; s <= 5; s++) {
      allErrors.push(...validateStep(s));
    }
    if (allErrors.length > 0) {
      setStepErrors(allErrors);
      setSubmitError('Completa todos los campos obligatorios antes de finalizar.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.submitPreOnboarding({
        ...values,
        pensionFund: values.pensionFund?.trim() ?? '',
        severanceFund: values.severanceFund?.trim() ?? '',
        childrenCount: values.hasChildren ? Number(values.childrenCount || 0) : 0,
        token,
        documents,
      });
      window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${token}`);
      setReceipt(res);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error enviando el formulario de pre-ingreso.');
    } finally {
      setSubmitting(false);
    }
  };

  if (tokenState === 'VERIFYING') {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="p-8 text-center space-y-2">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-500" />
          <p className="text-sm font-medium">Validando enlace seguro de pre-ingreso...</p>
          <p className="text-xs text-slate-500">Verificando firma JWT y vigencia del acceso.</p>
        </CardContent>
      </Card>
    );
  }

  if (tokenState === 'INVALID') {
    return (
      <Card className="mx-auto max-w-xl border-rose-200 dark:border-rose-900">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg">Enlace Inválido o Expirado</CardTitle>
          <CardDescription>
            {tokenError ?? 'No cuentas con autorización activa para acceder a este formulario.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-slate-500">
          Por seguridad y gestión de roles, solicita un nuevo enlace de pre-ingreso al equipo de
          Talento Humano de Alliance.
        </CardContent>
      </Card>
    );
  }

  if (receipt) {
    return (
      <Card className="mx-auto max-w-2xl border-emerald-200 dark:border-emerald-900">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Pre-Ingreso Registrado Exitosamente</CardTitle>
          <CardDescription>
            Tu expediente digital de 24 campos y tu firma electrónica Ley 1581 fueron enviados a Talento Humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-2 dark:bg-slate-950">
            <div className="flex justify-between">
              <span className="text-slate-500">ID Expediente:</span>
              <span className="font-mono text-xs">{receipt.employeeId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ID Workflow:</span>
              <span className="font-mono text-xs">{receipt.workflowId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Edad calculada:</span>
              <span className="font-semibold">{receipt.computedAge} años</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Política Habeas Data:</span>
              <span>{receipt.consentReceipt.policyVersion}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="block text-xs text-slate-500 mb-1">Sello criptográfico SHA-256:</span>
              <code className="block break-all rounded bg-slate-200/70 p-2 text-[11px] dark:bg-slate-900">
                {receipt.consentReceipt.documentSha256Hash}
              </code>
            </div>
          </div>
          {receipt.isRehire && (
            <Badge variant="purple" className="w-full justify-center py-1.5">
              Reintegro vinculado automáticamente al expediente histórico
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Encabezado y barra de progreso */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portal de Pre-Ingreso Digital</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {invitedCandidateName ? `Hola, ${invitedCandidateName} · ` : ''}
            Formato Único Alliance (24 campos) · Paso {step} de 5: {STEPS[step - 1].title}
          </p>
        </div>
        {draftSavedAt && (
          <Badge variant="secondary" className="self-start sm:self-auto">
            <Save className="h-3 w-3" /> Borrador guardado {draftSavedAt}
          </Badge>
        )}
      </div>

      {isCorrectionMode && correctionNote && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 space-y-1">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Devolución de Talento Humano — Corrección requerida
          </p>
          <p className="text-xs leading-relaxed">{correctionNote}</p>
        </div>
      )}

      <div className="space-y-2">
        <Progress value={(step / 5) * 100} />
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((s) => {
            const unlocked = s.number <= maxStepReached;
            return (
              <button
                key={s.number}
                type="button"
                disabled={!unlocked}
                onClick={() => handleSelectStepTab(s.number)}
                className={`rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                  !unlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  step === s.number
                    ? 'bg-blue-600 text-white font-semibold'
                    : s.number < step
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <span className="block font-bold">Paso {s.number}</span>
                <span className="hidden sm:block truncate">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step - 1].title}</CardTitle>
            <CardDescription>
              Completa todos los campos requeridos. Tus cambios se guardan automáticamente en este navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* PASO 1 */}
            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>1. Nombre Completo *</Label>
                  <Input placeholder="Ej: Laura Valentina Gómez" {...form.register('fullName', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>2. Nombre Preferido para Credenciales *</Label>
                  <Input placeholder="Ej: laura.gomez" {...form.register('preferredNameCredentials', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>3. Número de Cédula *</Label>
                  <div className="relative">
                    <Input placeholder="Solo números (ej: 1019234567)" {...form.register('nationalId', { required: true })} />
                    {checkingDuplicate && (
                      <RefreshCw className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />
                    )}
                  </div>
                  {duplicateCheck && !isCorrectionMode && (
                    <div
                      className={`mt-1.5 rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                        !duplicateCheck.exists
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : duplicateCheck.isRehire
                            ? 'bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                            : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}
                    >
                      {duplicateCheck.exists && !duplicateCheck.isRehire ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      )}
                      <span>{duplicateCheck.message}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>4. Lugar de Expedición *</Label>
                  <Input placeholder="Ej: Bogotá D.C." {...form.register('idIssuePlace', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>5. Fecha de Nacimiento *</Label>
                  <Input type="date" {...form.register('birthDate', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>6. Edad (Calculada automáticamente)</Label>
                  <Input value={watchedValues.birthDate ? `${computedAge} años` : '—'} readOnly className="bg-slate-100 dark:bg-slate-800 font-semibold" />
                </div>

                <div className="space-y-1.5">
                  <Label>7. Lugar de Nacimiento *</Label>
                  <Input placeholder="Ej: Medellín, Antioquia" {...form.register('birthPlace', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>8. Estado Civil *</Label>
                  <Select {...form.register('maritalStatus')}>
                    {MARITAL_STATUSES.map((ms) => (
                      <option key={ms} value={ms}>
                        {MARITAL_STATUS_LABELS[ms]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            {/* PASO 2 */}
            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>9. Dirección de Residencia *</Label>
                  <Input placeholder="Ej: Calle 127 # 45-20 Apto 502" {...form.register('address', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>10. Barrio y Ciudad *</Label>
                  <Input placeholder="Ej: Chapinero, Bogotá D.C." {...form.register('neighborhoodCity', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>11. Celular *</Label>
                  <Input placeholder="Ej: +57 310 555 0199" {...form.register('phone', { required: true })} />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>12. Correo Electrónico Personal *</Label>
                  <Input type="email" placeholder="Ej: tu.correo@gmail.com" {...form.register('personalEmail', { required: true })} />
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label>19. ¿Tiene Hijos?</Label>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      {...form.register('hasChildren')}
                    />
                  </div>
                  {watchedValues.hasChildren && (
                    <div className="pt-2">
                      <Label>Cantidad de hijos</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        className="mt-1"
                        {...form.register('childrenCount', { valueAsNumber: true })}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <Label>21. Talla de Camiseta (Dotación) *</Label>
                  <div className="grid grid-cols-6 gap-2 pt-1">
                    {SHIRT_SIZES.map((size) => {
                      const active = watchedValues.shirtSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => form.setValue('shirtSize', size)}
                          className={`h-10 rounded-lg border text-sm font-bold transition-all cursor-pointer ${
                            active
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* PASO 3 */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>14. Nivel de Escolaridad *</Label>
                    <Select {...form.register('educationLevel')}>
                      {EDUCATION_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {EDUCATION_LEVEL_LABELS[lvl]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>15. Último Título Académico *</Label>
                    <Input
                      placeholder="Ej: Ingeniería de Sistemas / Administración"
                      {...form.register('lastAcademicTitle', { required: true })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      { type: 'NATIONAL_ID_PDF', label: 'Cédula de Ciudadanía (PDF)' },
                      { type: 'ACADEMIC_CERTIFICATE', label: 'Diploma / Acta de Grado (PDF)' },
                    ] as const
                  ).map((slot) => {
                    const uploaded = documents.find((d) => d.documentType === slot.type);
                    return (
                      <div key={slot.type} className="space-y-2.5">
                        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-5 text-center hover:border-blue-500 cursor-pointer dark:border-slate-700">
                          <FileUp className="h-6 w-6 text-blue-600" />
                          <span className="text-sm font-medium">{slot.label}</span>
                          <span className="text-xs text-slate-500">
                            {uploadingDoc === slot.type
                              ? 'Subiendo a Supabase Storage (alliance)...'
                              : uploaded
                                ? 'Haz clic para reemplazar archivo'
                                : 'Haz clic para adjuntar PDF o imagen (máx. 10 MB)'}
                          </span>
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null, slot.type)}
                          />
                        </label>
                        {renderInlinePreviewCard(slot.type)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PASO 4 */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>16. EPS *</Label>
                    <Input placeholder="Ej: Sura EPS / Sanitas" {...form.register('eps', { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>17. Fondo de Pensión (Opcional)</Label>
                    <Input placeholder="Opcional · Ej: Porvenir / Protección" {...form.register('pensionFund')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>18. Fondo de Cesantías (Opcional)</Label>
                    <Input placeholder="Opcional · Ej: Porvenir / FNA" {...form.register('severanceFund')} />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>20. ¿Cuenta con cuenta activa en Bancolombia?</Label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Si respondes Sí, adjunta tu certificación bancaria para dispersión de nómina.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-blue-600"
                      {...form.register('hasBancolombiaAccount')}
                    />
                  </div>

                  {watchedValues.hasBancolombiaAccount && (
                    <div className="space-y-2.5">
                      <label className="flex items-center justify-between rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 p-4 cursor-pointer dark:border-blue-800 dark:bg-blue-950/30">
                        <div className="flex items-center gap-3">
                          <FileUp className="h-5 w-5 text-blue-600" />
                          <div className="text-sm">
                            <span className="font-medium block">Certificación Bancaria Bancolombia (PDF)</span>
                            <span className="text-xs text-slate-500">
                              {uploadingDoc === 'BANK_CERTIFICATE'
                                ? 'Subiendo a Supabase Storage (alliance)...'
                                : documents.find((d) => d.documentType === 'BANK_CERTIFICATE')?.fileName ??
                                  'Haz clic para seleccionar el archivo'}
                            </span>
                          </div>
                        </div>
                        <Badge variant="default">Requerido</Badge>
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleFileUpload(e.target.files?.[0] ?? null, 'BANK_CERTIFICATE')
                          }
                        />
                      </label>
                      {renderInlinePreviewCard('BANK_CERTIFICATE')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PASO 5 */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>22. Contacto de Emergencia: Nombre *</Label>
                    <Input placeholder="Nombre completo" {...form.register('emergencyContactName', { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>23. Parentesco *</Label>
                    <Input placeholder="Ej: Madre / Esposo(a)" {...form.register('emergencyContactRelationship', { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>24. Celular de Emergencia *</Label>
                    <Input placeholder="+57 311 ..." {...form.register('emergencyContactPhone', { required: true })} />
                  </div>
                </div>

                {/* Caja Legal Ley 1581 */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3 dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
                      <ShieldCheck className="h-4 w-4" />
                      Cumplimiento Ley 1581 de 2012 (Habeas Data)
                    </span>
                    <Badge variant="outline">{HABEAS_DATA_POLICY_VERSION}</Badge>
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-600 whitespace-pre-line border border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800">
                    {HABEAS_DATA_POLICY_TEXT}
                  </div>
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-blue-600"
                      {...form.register('habeasDataAccepted')}
                    />
                    <span>
                      Acepto de manera expresa la Política de Tratamiento de Datos Personales bajo la{' '}
                      <strong>Ley 1581 de 2012</strong> y autorizo la captura de mi firma electrónica con
                      sello SHA-256, IP y marca de tiempo.
                    </span>
                  </label>
                </div>

                {/* Canvas Firma Digital */}
                <div className="space-y-2">
                  <Label>Firma Electrónica Manuscrita *</Label>
                  <SignaturePad
                    value={watchedValues.signatureDataUrl}
                    onChange={(url) => form.setValue('signatureDataUrl', url)}
                  />
                </div>

                {/* Validación OTP */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <Label className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-blue-600" />
                        Verificación OTP (6 dígitos)
                      </Label>
                      <p className="text-xs text-slate-500">
                        Solicita un código temporal a tu correo ({watchedValues.personalEmail || 'pendiente'}) para sellar la firma.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleSendOtp}>
                      Enviar código OTP
                    </Button>
                  </div>

                  {otpSentInfo?.sent && (
                    <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      OTP enviado correctamente.{' '}
                      {otpSentInfo.devOtp && (
                        <strong>Código DEV: {otpSentInfo.devOtp}</strong>
                      )}
                    </div>
                  )}

                  <Input
                    maxLength={6}
                    placeholder="Ingresa los 6 dígitos (en dev también funciona 123456)"
                    {...form.register('otpCode')}
                  />
                </div>

                {submitError && (
                  <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {submitError}
                  </div>
                )}
              </div>
            )}

            {stepErrors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-1 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                <p className="font-semibold">
                  Completa los siguientes campos obligatorios para continuar:
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {stepErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Navegación entre pasos */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                disabled={step === 1}
                onClick={() => {
                  setStepErrors([]);
                  setStep((s) => Math.max(1, s - 1));
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>

              {step < 5 ? (
                <Button type="button" onClick={handleNextStep}>
                  Siguiente Paso
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" variant="success" disabled={submitting}>
                  <ShieldCheck className="h-4 w-4" />
                  {submitting
                    ? 'Firmando y enviando...'
                    : isCorrectionMode
                      ? 'Guardar Corrección y Reenviar a TH'
                      : 'Firmar Ley 1581 y Finalizar Pre-Ingreso'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </form>

      <DocumentPreviewModal
        open={Boolean(activePreview)}
        fileName={activePreview?.fileName ?? ''}
        mimeType={activePreview?.mimeType ?? 'application/pdf'}
        objectUrl={activePreview?.objectUrl ?? null}
        onClose={() => setActivePreview(null)}
      />
    </div>
  );
}
