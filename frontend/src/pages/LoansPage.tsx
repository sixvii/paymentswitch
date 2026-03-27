import { ChangeEvent, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { BriefcaseBusiness, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import type { Loan } from '@/types';

type LoanType = 'student' | 'business';

const loanCardConfig: Record<LoanType, { title: string; icon: React.ElementType; desc: string }> = {
  student: {
    title: 'Student Loan',
    icon: GraduationCap,
    desc: 'Good credit score can access up to NGN 100,000',
  },
  business: {
    title: 'Business Loan',
    icon: BriefcaseBusiness,
    desc: 'Score 600+ can access NGN 1,000,000 and can grow with perfect repayments',
  },
};

const LoansPage = () => {
  const { currentUser, trustScore, loans, getLoanLimit, applyLoan, repayLoan } = useStore();

  const [selectedType, setSelectedType] = useState<LoanType>('student');
  const [amount, setAmount] = useState('');
  const [expandedLoanId, setExpandedLoanId] = useState('');

  const [schoolName, setSchoolName] = useState('');
  const [department, setDepartment] = useState('');
  const [course, setCourse] = useState('');
  const [level, setLevel] = useState('');
  const [studentBvn, setStudentBvn] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [passportImage, setPassportImage] = useState('');
  const [schoolIdCardImage, setSchoolIdCardImage] = useState('');

  const [businessRegisteredName, setBusinessRegisteredName] = useState('');
  const [businessBvn, setBusinessBvn] = useState('');
  const [businessStoreImage, setBusinessStoreImage] = useState('');
  const [selfImage, setSelfImage] = useState('');
  const [cacDocument, setCacDocument] = useState('');

  const myLoans = useMemo(
    () => loans.filter((loan) => loan.borrowerId === currentUser?.id),
    [loans, currentUser?.id],
  );

  const studentLimit = getLoanLimit('student');
  const businessLimit = getLoanLimit('business');
  const hasActiveLoan = myLoans.some((loan) => loan.status === 'active');
  const selectedLimit = getLoanLimit(selectedType);

  const maskBvn = (value: string) => (
    value.length === 11 ? `${value.slice(0, 2)}******${value.slice(-3)}` : value
  );

  const renderSubmittedDocuments = (loan: Loan) => {
    const details = loan.applicationDetails;
    if (!details) {
      return <p className="text-sm text-muted-foreground mt-3">No submitted documents found for this loan.</p>;
    }

    if (details.type === 'student') {
      const d = details.studentDetails;
      return (
        <div className="mt-3 rounded-xl border border-[#0C436A] bg-background p-3 space-y-2 text-sm">
          <p className="text-foreground"><span className="font-medium">School:</span> {d.schoolName}</p>
          <p className="text-foreground"><span className="font-medium">Department:</span> {d.department}</p>
          <p className="text-foreground"><span className="font-medium">Course:</span> {d.course}</p>
          <p className="text-foreground"><span className="font-medium">Level:</span> {d.level}</p>
          <p className="text-foreground"><span className="font-medium">Graduation Year:</span> {d.graduationYear}</p>
          <p className="text-foreground"><span className="font-medium">BVN:</span> {maskBvn(d.bvn)}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a href={d.passportImage} target="_blank" rel="noreferrer" className="text-[#0C436A] font-medium underline">
              View Passport
            </a>
            <a href={d.schoolIdCardImage} target="_blank" rel="noreferrer" className="text-[#0C436A] font-medium underline">
              View School ID Card
            </a>
          </div>
        </div>
      );
    }

    const d = details.businessDetails;
    return (
      <div className="mt-3 rounded-xl border border-[#0C436A] bg-background p-3 space-y-2 text-sm">
        <p className="text-foreground"><span className="font-medium">Business Name:</span> {d.businessRegisteredName}</p>
        <p className="text-foreground"><span className="font-medium">BVN:</span> {maskBvn(d.bvn)}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <a href={d.businessStoreImage} target="_blank" rel="noreferrer" className="text-[#0C436A] font-medium underline">
            View Business Store Image
          </a>
          <a href={d.selfImage} target="_blank" rel="noreferrer" className="text-[#0C436A] font-medium underline">
            View Self Image
          </a>
          <a href={d.cacDocument} target="_blank" rel="noreferrer" className="text-[#0C436A] font-medium underline">
            View CAC Document
          </a>
        </div>
      </div>
    );
  };

  const readFileAsDataUrl = (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === 'string' ? reader.result : '';
        if (!value) {
          reject(new Error('Unable to read file'));
          return;
        }
        resolve(value);
      };
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    })
  );

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
    allowedTypes: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isImageAllowed = allowedTypes.includes('image/*') && file.type.startsWith('image/');
    const isPdfAllowed = allowedTypes.includes('.pdf') && file.type === 'application/pdf';
    if (!isImageAllowed && !isPdfAllowed) {
      toast.error('Please upload the correct file type');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be 5MB or less');
      return;
    }

    try {
      const value = await readFileAsDataUrl(file);
      setter(value);
      toast.success('File uploaded');
    } catch {
      toast.error('Unable to upload file');
    }
  };

  const handleApply = async () => {
    const parsedAmount = Number(amount);
    let result;

    if (selectedType === 'student') {
      if (!schoolName || !department || !course || !level || !graduationYear) {
        toast.error('Fill all student loan fields');
        return;
      }
      if (studentBvn.length !== 11) {
        toast.error('Student BVN must be exactly 11 digits');
        return;
      }
      if (!/^\d{4}$/.test(graduationYear)) {
        toast.error('Graduation year must be 4 digits');
        return;
      }
      if (!passportImage || !schoolIdCardImage) {
        toast.error('Upload passport and school ID card');
        return;
      }

      result = await applyLoan(selectedType, parsedAmount, {
        type: 'student',
        studentDetails: {
          schoolName,
          department,
          course,
          level,
          bvn: studentBvn,
          graduationYear,
          passportImage,
          schoolIdCardImage,
        },
      });
    } else {
      if (!businessRegisteredName) {
        toast.error('Enter business registered name');
        return;
      }
      if (businessBvn.length !== 11) {
        toast.error('Business BVN must be exactly 11 digits');
        return;
      }
      if (!businessStoreImage || !selfImage || !cacDocument) {
        toast.error('Upload business store image, self image, and CAC document');
        return;
      }

      result = await applyLoan(selectedType, parsedAmount, {
        type: 'business',
        businessDetails: {
          businessRegisteredName,
          businessStoreImage,
          selfImage,
          cacDocument,
          bvn: businessBvn,
        },
      });
    }

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setAmount('');
    setSchoolName('');
    setDepartment('');
    setCourse('');
    setLevel('');
    setStudentBvn('');
    setGraduationYear('');
    setPassportImage('');
    setSchoolIdCardImage('');
    setBusinessRegisteredName('');
    setBusinessBvn('');
    setBusinessStoreImage('');
    setSelfImage('');
    setCacDocument('');
  };

  const handleRepay = async (loanId: string) => {
    const result = await repayLoan(loanId);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
  };

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground">Loans</h1>

      <div className="rounded-[10px] border border-border p-4">
        <p className="text-sm text-muted-foreground">Credit Score</p>
        <p className="text-2xl font-bold text-foreground">{trustScore.overall} / 850</p>
        <p className="text-xs text-muted-foreground mt-1">Business loan tier starts from 500, while 600+ unlocks NGN 1,000,000</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(Object.entries(loanCardConfig) as [LoanType, (typeof loanCardConfig)[LoanType]][]).map(([type, config]) => {
          const Icon = config.icon;
          const isActive = selectedType === type;
          const maxLimit = getLoanLimit(type);

          return (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`text-left p-4 rounded-[10px] border transition-colors ${
                isActive ? 'border-[#0C436A] bg-[#F2F5F7]' : 'border-border bg-card hover:bg-muted/50'
              }`}
            >
              <div className="w-11 h-11 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-[#0C436A]" />
              </div>
              <p className="font-semibold text-foreground">{config.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{config.desc}</p>
              <p className="text-sm font-semibold text-[#0C436A] mt-3">Max: NGN {maxLimit.toLocaleString()}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-[10px] border border-[#0C436A] p-4 space-y-4">
        <p className="font-semibold text-foreground">Apply for {loanCardConfig[selectedType].title}</p>

        {selectedType === 'student' ? (
          <>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">School Name</label>
              <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Department</label>
              <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Course</label>
              <input type="text" value={course} onChange={(e) => setCourse(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Level</label>
              <input type="text" value={level} onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. 200 Level"
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">BVN</label>
              <input type="text" value={studentBvn} onChange={(e) => setStudentBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                inputMode="numeric" maxLength={11}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Graduation Year</label>
              <input type="text" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" maxLength={4}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Upload Passport</label>
              <input type="file" accept="image/*" onChange={(e) => void handleFileUpload(e, setPassportImage, 'image/*')}
                className="w-full p-3 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Upload School ID Card</label>
              <input type="file" accept="image/*" onChange={(e) => void handleFileUpload(e, setSchoolIdCardImage, 'image/*')}
                className="w-full p-3 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Business Registered Name</label>
              <input type="text" value={businessRegisteredName} onChange={(e) => setBusinessRegisteredName(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">BVN</label>
              <input type="text" value={businessBvn} onChange={(e) => setBusinessBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                inputMode="numeric" maxLength={11}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Upload Business Store Image</label>
              <input type="file" accept="image/*" onChange={(e) => void handleFileUpload(e, setBusinessStoreImage, 'image/*')}
                className="w-full p-3 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Upload Self Image</label>
              <input type="file" accept="image/*" onChange={(e) => void handleFileUpload(e, setSelfImage, 'image/*')}
                className="w-full p-3 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Upload CAC Document</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => void handleFileUpload(e, setCacDocument, 'image/*,.pdf')}
                className="w-full p-3 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground" />
            </div>
          </>
        )}

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Amount (NGN)</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={`Enter amount (max NGN ${selectedLimit.toLocaleString()})`}
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
          />
        </div>
        <button
          onClick={handleApply}
          disabled={!selectedLimit || hasActiveLoan}
          className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          {hasActiveLoan ? 'Repay active loan first' : 'Apply for Loan'}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">My Loans</h2>
        {myLoans.length > 0 ? myLoans.map((loan) => {
          const isActive = loan.status === 'active';
          return (
            <div key={loan.id} className="rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground capitalize">{loan.type} Loan</p>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${isActive ? 'text-[#208F9A]' : 'text-[#0C436A]'}`}>
                  {loan.status}
                </span>
              </div>
              <p className="text-[17px] font-bold text-foreground mt-2">NGN {loan.amount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Due: {new Date(loan.dueDate).toLocaleDateString('en-NG')}</p>
              {loan.repaidAt && (
                <p className="text-xs text-muted-foreground">Repaid: {new Date(loan.repaidAt).toLocaleDateString('en-NG')}</p>
              )}
              <button
                onClick={() => setExpandedLoanId((prev) => prev === loan.id ? '' : loan.id)}
                className="mt-3 w-full py-2 rounded-[10px] border border-[#0C436A] text-[#0C436A] font-semibold"
              >
                {expandedLoanId === loan.id ? 'Hide Submitted Documents' : 'View Submitted Documents'}
              </button>
              {expandedLoanId === loan.id && renderSubmittedDocuments(loan)}
              {isActive && (
                <button
                  onClick={() => handleRepay(loan.id)}
                  className="mt-3 w-full py-2 rounded-[10px] bg-success text-success-foreground font-semibold"
                >
                  Repay Loan
                </button>
              )}
            </div>
          );
        }) : (
          <p className="text-sm text-muted-foreground">No loans yet.</p>
        )}
      </div>

      <div className="text-xs text-muted-foreground bg-card border border-border rounded-2xl p-4">
        <p>Student loan max at good credit score: NGN 100,000.</p>
        <p>Business loan max at score 600 and above: NGN 1,000,000.</p>
        <p>Business loan limit increases by NGN 100,000 after each perfect on-time business repayment.</p>
        <p>Current quick caps: student NGN {studentLimit.toLocaleString()} | business NGN {businessLimit.toLocaleString()}.</p>
      </div>
    </div>
  );
};

export default LoansPage;
