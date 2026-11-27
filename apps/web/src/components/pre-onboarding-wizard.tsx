'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import {
  AlertTriangle,
  ArrowLeft,
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
  HABEAS_DATA_LEGAL_REVIEW_NOTE,
  HABEAS_DATA_POLICY_TEXT,
  HABEAS_DATA_POLICY_VERSION,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  SHIRT_SIZES,
  ShirtSize,
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
  SUPABASE_FREE_MAX_FILE_SIZE_LABEL,
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
  { number: 1, title: 'Tratamiento de Datos e Identificación' },
  { number: 2, title: 'Ubicación, Contacto y Dotación' },
  { number: 3, title: 'Formación Académica' },
  { number: 4, title: 'Seguridad Social y Banco' },
  { number: 5, title: 'Emergencia, Firma Manuscrita y OTP' },
];

const DRAFT_KEY_PREFIX = 'alliance-hcm-preonboarding-draft-';

export function PreOnboardingWizard({ token }: { token: string }) {
  const isDemoMode =
    token === 'demo' && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';
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
  const [otpSentInfo, setOtpSentInfo] = useState<{
    sent: boolean;
    emailSent?: boolean;
    email?: string;
    devOtp?: string;
  } | null>(null);
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

  // Validar Magic Link JWT contra el backend al cargar (o modo demo UAT)
  useEffect(() => {
    if (isDemoMode) {
      setTokenState('VALID');
      setInvitedCandidateName('Camila Andrea Suárez (Demo)');
      setIsCorrectionMode(true);
      setCorrectionNote(
        'Vista previa de devolución TH: "Por favor confirma tu EPS actual y adjunta nuevamente tu cédula legible."',
      );
      form.reset({
        ...form.getValues(),
        fullName: 'Camila Andrea Suárez Pardo',
        preferredNameCredentials: 'Camila Suárez',
        nationalId: '1020304050',
        idIssuePlace: 'Bogotá D.C.',
        birthDate: '1997-06-14',
        birthPlace: 'Bogotá D.C.',
        maritalStatus: 'SOLTERO',
        address: 'Calle 100 # 15-40 Apto 402',
        neighborhoodCity: 'Chicó · Bogotá D.C.',
        phone: '3104567890',
        personalEmail: 'candidato.demo@correo.com',
        hasChildren: false,
        childrenCount: 0,
        shirtSize: 'M',
        educationLevel: 'PROFESIONAL',
        lastAcademicTitle: 'Ingeniería Industrial',
        eps: 'Sura EPS',
        pensionFund: '',
        severanceFund: '',
        hasBancolombiaAccount: true,
        emergencyContactName: 'Marta Pardo',
        emergencyContactRelationship: 'Madre',
        emergencyContactPhone: '3112233445',
        habeasDataAccepted: false,
        signatureDataUrl: '',
        otpCode: '',
      });
      setDocuments([
        {
          documentType: 'NATIONAL_ID_PDF',
          fileName: 'Cedula_Camila_Suarez_Demo.pdf',
          mimeType: 'application/pdf',
          fileSize: 98400,
          s3Key: 'demo/national-id.pdf',
          s3Url: '/demo/national-id.pdf',
        },
      ]);
      setMaxStepReached(5);
      return;
    }

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
    if (isDemoMode) {
      setDuplicateCheck(null);
      return;
    }
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
  }, [watchedValues.nationalId, watchedValues.personalEmail, isDemoMode]);

  const handleFileUpload = async (
    file: File | null,
    documentType: UploadedDocumentInput['documentType'],
  ) => {
    if (!file) return;
    if (file.size > SUPABASE_FREE_MAX_FILE_SIZE_BYTES) {
      setUploadErrors((prev) => ({
        ...prev,
        [documentType]: `El archivo "${file.name}" supera el límite de ${SUPABASE_FREE_MAX_FILE_SIZE_LABEL} para Supabase Storage (Free Tier).`,
      }));
      return;
    }
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

    if (isDemoMode) {
      setDocuments((prev) => [
        ...prev.filter((d) => d.documentType !== documentType),
        {
          documentType,
          fileName: file.name,
          mimeType,
          fileSize: file.size,
          s3Key: `demo/${documentType.toLowerCase()}-${file.name}`,
          s3Url: localObjectUrl,
        },
      ]);
      setUploadingDoc(null);
      return;
    }

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
      <div className="rounded-md border border-zinc-200/80 bg-zinc-50/60 p-3 space-y-2.5 dark:border-zinc-800/80 dark:bg-zinc-950/60">
        {local && (
          <div className="overflow-hidden rounded border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={local.objectUrl}
                alt={fileName}
                className="h-28 w-full object-contain p-1"
              />
            ) : isPdf ? (
              <iframe
                src={local.objectUrl}
                title={fileName}
                className="h-32 w-full bg-white"
              />
            ) : (
              <div className="flex h-16 items-center justify-center text-xs text-zinc-500">
                Archivo listo ({fileName})
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="font-medium truncate text-zinc-900 dark:text-zinc-100">{fileName}</p>
            <p className="text-[11px] text-zinc-500">
              {fileSizeKb} KB ·{' '}
              {uploaded ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  Guardado en Supabase (alliance)
                </span>
              ) : errMsg ? (
                <span className="text-rose-600 dark:text-rose-400">Error al subir</span>
              ) : (
                'Subiendo...'
              )}
            </p>
          </div>

          {local && (
            <div className="flex items-center gap-1">
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
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </a>
            </div>
          )}
        </div>

        {errMsg && (
          <div className="rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
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
    if (isDemoMode) {
      setOtpSentInfo({ sent: true, devOtp: '123456' });
      return;
    }
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
      if (isDemoMode) {
        setReceipt({
          employeeId: 'demo-emp-uat',
          workflowId: 'demo-wf-uat',
          isRehire: false,
          computedAge: calculateAge(values.birthDate),
          consentReceipt: {
            documentSha256Hash: 'demo-sha256-ley1581-simulado-uat',
            policyVersion: HABEAS_DATA_POLICY_VERSION,
          },
        });
        return;
      }
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
      <Card className="mx-auto max-w-lg">
        <CardContent className="p-8 text-center space-y-2">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
          <p className="text-sm font-medium">Validando enlace seguro de pre-ingreso...</p>
          <p className="text-xs text-zinc-500">Verificando firma JWT y vigencia del acceso.</p>
        </CardContent>
      </Card>
    );
  }

  if (tokenState === 'INVALID') {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <CardTitle className="text-base">Enlace inválido o expirado</CardTitle>
          <CardDescription>
            {tokenError ?? 'No cuentas con autorización activa para acceder a este formulario.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-zinc-500">
          Solicita un nuevo enlace de pre-ingreso al equipo de Talento Humano de Alliance.
        </CardContent>
      </Card>
    );
  }

  if (receipt) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg">
            {isDemoMode ? 'Pre-Ingreso validado (Vista Previa UAT)' : 'Pre-Ingreso registrado'}
          </CardTitle>
          <CardDescription>
            {isDemoMode
              ? 'Validación de 24 campos, documentos y firma Ley 1581 simulada sin modificar datos reales.'
              : 'Tu expediente de 24 campos y firma electrónica Ley 1581 fueron enviados a Talento Humano.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-zinc-200/80 divide-y divide-zinc-200/80 text-xs dark:border-zinc-800/80 dark:divide-zinc-800/80">
            <div className="flex justify-between px-3.5 py-2.5">
              <span className="text-zinc-500">ID Expediente</span>
              <span className="font-mono">{receipt.employeeId}</span>
            </div>
            <div className="flex justify-between px-3.5 py-2.5">
              <span className="text-zinc-500">ID Workflow</span>
              <span className="font-mono">{receipt.workflowId}</span>
            </div>
            <div className="flex justify-between px-3.5 py-2.5">
              <span className="text-zinc-500">Edad calculada</span>
              <span className="font-medium">{receipt.computedAge} años</span>
            </div>
            <div className="flex justify-between px-3.5 py-2.5">
              <span className="text-zinc-500">Política Habeas Data</span>
              <span>{receipt.consentReceipt.policyVersion}</span>
            </div>
            <div className="px-3.5 py-2.5 space-y-1">
              <span className="block text-zinc-500">Sello criptográfico SHA-256</span>
              <code className="block break-all text-[11px] text-zinc-600 dark:text-zinc-300">
                {receipt.consentReceipt.documentSha256Hash}
              </code>
            </div>
          </div>
          {receipt.isRehire && (
            <Badge variant="outline" className="w-full justify-center py-1.5">
              Reintegro vinculado automáticamente al expediente histórico
            </Badge>
          )}
          {isDemoMode && (
            <div className="flex justify-center pt-1">
              <Link
                href="/candidato/demo"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al Portal del Candidato
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-zinc-300 px-3.5 py-2 text-xs dark:border-zinc-700">
          <span className="text-zinc-600 dark:text-zinc-400">
            <strong>Modo Vista Previa UAT:</strong> explora los 5 pasos, validaciones obligatorias y firma Ley 1581 sin crear registros reales.
          </span>
          <Link
            href="/candidato/demo"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al Portal del Candidato
          </Link>
        </div>
      )}

      {/* Encabezado y barra de progreso */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Portal de Pre-Ingreso</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {invitedCandidateName ? `Hola, ${invitedCandidateName} · ` : ''}
            Paso {step} de 5 · {STEPS[step - 1].title}
          </p>
        </div>
        {draftSavedAt && (
          <Badge variant="outline" className="self-start sm:self-auto">
            <Save className="h-3 w-3" /> Borrador {draftSavedAt}
          </Badge>
        )}
      </div>

      {isCorrectionMode && correctionNote && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
          <p className="font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Devolución de Talento Humano — Corrección requerida
          </p>
          <p className="leading-relaxed opacity-90">{correctionNote}</p>
        </div>
      )}

      <div className="space-y-2.5">
        <Progress value={(step / 5) * 100} />
        <div className="grid grid-cols-5 gap-1.5">
          {STEPS.map((s) => {
            const unlocked = s.number <= maxStepReached;
            const current = step === s.number;
            const completed = s.number < step;
            return (
              <button
                key={s.number}
                type="button"
                disabled={!unlocked}
                onClick={() => handleSelectStepTab(s.number)}
                className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${!unlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                  } ${current
                    ? 'border-zinc-900 bg-zinc-900 text-white font-medium dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : completed
                      ? 'border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-100'
                      : 'border-transparent text-zinc-400 dark:text-zinc-500'
                  }`}
              >
                <span className="block text-[11px] opacity-75">Paso {s.number}</span>
                <span className="hidden sm:block truncate font-medium">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <CardTitle className="text-base">{STEPS[step - 1].title}</CardTitle>
            <CardDescription>
              Completa los campos requeridos. El progreso se guarda automáticamente en tu navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* PASO 1: Consentimiento Ley 1581 en Primera Página + Identificación */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="rounded-md border border-zinc-200/80 bg-zinc-50/70 p-4 space-y-3 dark:border-zinc-800/80 dark:bg-zinc-950/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      <ShieldCheck className="h-4 w-4 text-zinc-500" />
                      Autorización Previa de Tratamiento de Datos · Ley 1581 de 2012
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="warning">Validar con Jurídico</Badge>
                      <Badge variant="outline">{HABEAS_DATA_POLICY_VERSION}</Badge>
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded border border-zinc-200/80 bg-white p-3 text-xs leading-relaxed text-zinc-600 whitespace-pre-line dark:border-zinc-800/80 dark:bg-[#0f0f12] dark:text-zinc-300">
                    {HABEAS_DATA_POLICY_TEXT}
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {HABEAS_DATA_LEGAL_REVIEW_NOTE}
                  </p>
                  <label className="flex items-start gap-2.5 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                      {...form.register('habeasDataAccepted')}
                    />
                    <span>
                      Acepto de manera previa la Política de Tratamiento de Datos Personales bajo la{' '}
                      <strong>Ley 1581 de 2012</strong> para registrar mis datos personales y firmar
                      electrónicamente al finalizar.
                    </span>
                  </label>
                </div>

                {!watchedValues.habeasDataAccepted && (
                  <div className="rounded-md border border-amber-200/80 bg-amber-50/60 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    Marca la autorización de tratamiento de datos arriba para habilitar el
                    diligenciamiento de tus datos personales.
                  </div>
                )}

                <fieldset
                  disabled={!watchedValues.habeasDataAccepted}
                  className={`grid gap-4 sm:grid-cols-2 ${!watchedValues.habeasDataAccepted ? 'opacity-50' : ''}`}
                >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>1. Nombre completo *</Label>
                  <Input placeholder="Ej: Laura Valentina Gómez" {...form.register('fullName', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>2. Nombre preferido para credenciales *</Label>
                  <Input placeholder="Ej: laura.gomez" {...form.register('preferredNameCredentials', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>3. Número de cédula *</Label>
                  <div className="relative">
                    <Input placeholder="Solo números (ej: 1019234567)" {...form.register('nationalId', { required: true })} />
                    {checkingDuplicate && (
                      <RefreshCw className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-zinc-400" />
                    )}
                  </div>
                  {duplicateCheck && !isCorrectionMode && (
                    <div
                      className={`mt-1.5 rounded-md px-2.5 py-2 text-xs flex items-start gap-2 ${!duplicateCheck.exists
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : duplicateCheck.isRehire
                          ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                    >
                      {duplicateCheck.exists && !duplicateCheck.isRehire ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>{duplicateCheck.message}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>4. Lugar de expedición *</Label>
                  <Input placeholder="Ej: Bogotá D.C." {...form.register('idIssuePlace', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>5. Fecha de nacimiento *</Label>
                  <Input type="date" {...form.register('birthDate', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>6. Edad (calculada automáticamente)</Label>
                  <Input
                    value={watchedValues.birthDate ? `${computedAge} años` : '—'}
                    readOnly
                    className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>7. Lugar de nacimiento *</Label>
                  <Input placeholder="Ej: Medellín, Antioquia" {...form.register('birthPlace', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>8. Estado civil *</Label>
                  <Select {...form.register('maritalStatus')}>
                    {MARITAL_STATUSES.map((ms) => (
                      <option key={ms} value={ms}>
                        {MARITAL_STATUS_LABELS[ms]}
                      </option>
                    ))}
                  </Select>
                </div>
                </fieldset>
              </div>
            )}

            {/* PASO 2 */}
            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>9. Dirección de residencia *</Label>
                  <Input placeholder="Ej: Calle 127 # 45-20 Apto 502" {...form.register('address', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>10. Barrio y ciudad *</Label>
                  <Input placeholder="Ej: Chapinero, Bogotá D.C." {...form.register('neighborhoodCity', { required: true })} />
                </div>

                <div className="space-y-1.5">
                  <Label>11. Celular *</Label>
                  <Input placeholder="Ej: +57 310 555 0199" {...form.register('phone', { required: true })} />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>12. Correo electrónico personal *</Label>
                  <Input type="email" placeholder="Ej: tu.correo@gmail.com" {...form.register('personalEmail', { required: true })} />
                </div>

                <div className="space-y-2 rounded-md border border-zinc-200/80 p-3.5 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <Label>19. ¿Tiene hijos?</Label>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                      {...form.register('hasChildren')}
                    />
                  </div>
                  {watchedValues.hasChildren && (
                    <div className="pt-2 space-y-1">
                      <Label>Cantidad de hijos</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        {...form.register('childrenCount', { valueAsNumber: true })}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-md border border-zinc-200/80 p-3.5 dark:border-zinc-800/80">
                  <Label>21. Talla de camiseta (dotación) *</Label>
                  <div className="grid grid-cols-6 gap-1.5 pt-1">
                    {SHIRT_SIZES.map((size) => {
                      const active = watchedValues.shirtSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => form.setValue('shirtSize', size)}
                          className={`h-9 rounded-md border text-xs font-medium transition-colors cursor-pointer ${active
                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
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
                    <Label>14. Nivel de escolaridad *</Label>
                    <Select {...form.register('educationLevel')}>
                      {EDUCATION_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {EDUCATION_LEVEL_LABELS[lvl]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>15. Último título académico *</Label>
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
                        <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 p-5 text-center transition-colors hover:border-zinc-500 cursor-pointer dark:border-zinc-700 dark:hover:border-zinc-500">
                          <FileUp className="h-5 w-5 text-zinc-500" />
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                            {slot.label}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {uploadingDoc === slot.type
                              ? 'Subiendo a Supabase Storage (alliance)...'
                              : uploaded
                                ? 'Haz clic para reemplazar archivo'
                                : 'Haz clic para adjuntar PDF o imagen (máx. 4 MB · Supabase Free Tier)'}
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
                    <Label>17. Fondo de pensión (opcional)</Label>
                    <Input placeholder="Opcional · Ej: Porvenir / Protección" {...form.register('pensionFund')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>18. Fondo de cesantías (opcional)</Label>
                    <Input placeholder="Opcional · Ej: Porvenir / FNA" {...form.register('severanceFund')} />
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200/80 p-4 space-y-3.5 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>20. ¿Cuenta con cuenta activa en Bancolombia?</Label>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Si respondes Sí, adjunta tu certificación bancaria para nómina.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                      {...form.register('hasBancolombiaAccount')}
                    />
                  </div>

                  {watchedValues.hasBancolombiaAccount && (
                    <div className="space-y-2.5">
                      <label className="flex items-center justify-between rounded-md border border-dashed border-zinc-300 bg-zinc-50/60 p-3.5 transition-colors hover:border-zinc-500 cursor-pointer dark:border-zinc-700 dark:bg-zinc-950/60">
                        <div className="flex items-center gap-3">
                          <FileUp className="h-4 w-4 text-zinc-500" />
                          <div className="text-xs">
                            <span className="font-medium block">
                              Certificación Bancaria Bancolombia (PDF)
                            </span>
                            <span className="text-zinc-500">
                              {uploadingDoc === 'BANK_CERTIFICATE'
                                ? 'Subiendo a Supabase Storage (alliance)...'
                                : documents.find((d) => d.documentType === 'BANK_CERTIFICATE')
                                  ?.fileName ?? 'Haz clic para seleccionar archivo'}
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline">Requerido</Badge>
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
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>22. Contacto de emergencia *</Label>
                    <Input placeholder="Nombre completo" {...form.register('emergencyContactName', { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>23. Parentesco *</Label>
                    <Input placeholder="Ej: Madre / Esposo(a)" {...form.register('emergencyContactRelationship', { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>24. Celular de emergencia *</Label>
                    <Input placeholder="+57 311 ..." {...form.register('emergencyContactPhone', { required: true })} />
                  </div>
                </div>

                {/* Resumen consentimiento aceptado en Paso 1 */}
                <div className="rounded-md border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    Tratamiento de Datos Ley 1581 aceptado en el Paso 1 ({HABEAS_DATA_POLICY_VERSION})
                  </span>
                  <Badge variant="outline">Sello SHA-256 + IP al firmar</Badge>
                </div>

                {/* Canvas Firma Digital */}
                <div className="space-y-1.5">
                  <Label>Firma electrónica manuscrita *</Label>
                  <SignaturePad
                    value={watchedValues.signatureDataUrl}
                    onChange={(url) => form.setValue('signatureDataUrl', url)}
                  />
                </div>

                {/* Validación OTP */}
                <div className="rounded-md border border-zinc-200/80 p-4 space-y-3 dark:border-zinc-800/80">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <Label className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-zinc-500" />
                        Verificación OTP (6 dígitos)
                      </Label>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Solicita un código temporal a {watchedValues.personalEmail || 'tu correo'}.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleSendOtp}>
                      Enviar código OTP
                    </Button>
                  </div>

                  {otpSentInfo?.sent && (
                    <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {otpSentInfo.emailSent
                        ? `Código OTP enviado al correo ${otpSentInfo.email ?? watchedValues.personalEmail}. Revisa tu bandeja de entrada o spam.`
                        : 'Código OTP generado en modo UAT.'}{' '}
                      {otpSentInfo.devOtp && <strong>Código DEV: {otpSentInfo.devOtp}</strong>}
                    </div>
                  )}

                  <Input
                    maxLength={6}
                    placeholder="Ingresa los 6 dígitos enviados a tu correo"
                    {...form.register('otpCode')}
                  />
                </div>

                {submitError && (
                  <div className="rounded-md bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {submitError}
                  </div>
                )}
              </div>
            )}

            {stepErrors.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 space-y-1 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200">
                <p className="font-medium">
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
            <div className="flex items-center justify-between pt-4 border-t border-zinc-200/80 dark:border-zinc-800/80">
              <Button
                type="button"
                variant="outline"
                size="sm"
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
                <Button type="button" size="sm" onClick={handleNextStep}>
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" variant="success" size="sm" disabled={submitting}>
                  <ShieldCheck className="h-4 w-4" />
                  {submitting
                    ? 'Enviando...'
                    : isCorrectionMode
                      ? 'Guardar corrección y reenviar'
                      : 'Firmar y finalizar'}
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
