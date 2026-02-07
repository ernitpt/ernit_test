/**
 * Generate HTML email for Valentine's Challenge — single email to purchaser with both codes
 */
export function generateValentineEmail(
    purchaserEmail: string,
    purchaserCode: string,
    partnerCode: string
): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #F9FAFB; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header {
      background: linear-gradient(135deg, #FF6B9D 0%, #C2185B 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
    .content { padding: 30px 24px; }
    .intro { font-size: 16px; color: #374151; margin-bottom: 24px; line-height: 1.7; }
    .codes-section { margin: 24px 0; }
    .codes-title {
      font-size: 18px;
      font-weight: bold;
      color: #111827;
      margin-bottom: 16px;
    }
    .code-card {
      background: #F9FAFB;
      border: 2px dashed #E5E7EB;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      text-align: center;
    }
    .code-card-purchaser { border-color: #C4B5FD; background: linear-gradient(135deg, #F5F3FF 0%, #FFF 100%); }
    .code-card-partner { border-color: #FECDD3; background: linear-gradient(135deg, #FFF0F6 0%, #FFF 100%); }
    .code-label {
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .code-label-purchaser { color: #8B5CF6; }
    .code-label-partner { color: #FF6B9D; }
    .code-text {
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 6px;
      font-family: 'Courier New', monospace;
      margin: 8px 0;
    }
    .code-text-purchaser { color: #8B5CF6; }
    .code-text-partner { color: #FF6B9D; }
    .code-hint {
      font-size: 13px;
      color: #9CA3AF;
      margin-top: 8px;
    }
    .share-note {
      background: #FFF7ED;
      border-left: 4px solid #F59E0B;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
      font-size: 14px;
      color: #92400E;
      line-height: 1.6;
    }
    .button-container { text-align: center; margin: 28px 0; }
    .button {
      display: inline-block;
      background: #FF6B9D;
      color: white !important;
      padding: 16px 40px;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      font-size: 16px;
    }
    .steps {
      background: #F9FAFB;
      padding: 20px 24px;
      border-radius: 12px;
      margin: 24px 0;
    }
    .steps h3 { color: #111827; margin-top: 0; font-size: 16px; }
    .steps ol { padding-left: 20px; margin: 0; }
    .steps li { margin: 10px 0; color: #6B7280; font-size: 14px; }
    .footer {
      text-align: center;
      color: #9CA3AF;
      padding: 30px 20px;
      background: #F9FAFB;
      border-top: 1px solid #E5E7EB;
    }
    .footer p { margin: 5px 0; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Valentine's Challenge!</h1>
      <p>Both redemption codes are below</p>
    </div>

    <div class="content">
      <p class="intro">
        Thank you for purchasing a Valentine's Challenge!
        Below are both redemption codes &mdash; one for you and one for your partner.
        Share your partner's code with them to get started!
      </p>

      <div class="codes-section">
        <div class="codes-title">Your Redemption Codes</div>

        <!-- Purchaser Code -->
        <div class="code-card code-card-purchaser">
          <div class="code-label code-label-purchaser">YOUR CODE</div>
          <div class="code-text code-text-purchaser">${purchaserCode}</div>
          <div class="code-hint">Use this code to set up your own goals</div>
        </div>

        <!-- Partner Code -->
        <div class="code-card code-card-partner">
          <div class="code-label code-label-partner">PARTNER'S CODE</div>
          <div class="code-text code-text-partner">${partnerCode}</div>
          <div class="code-hint">Share this code with your partner</div>
        </div>
      </div>

      <div class="share-note">
        <strong>Important:</strong> Send your partner their code above.
        Both of you need to redeem your own code to start the challenge together.
        You'll both work toward your goals — teamwork makes the dream work!
      </div>

      <div class="button-container">
        <a href="https://ernit.app" class="button">Redeem Your Code</a>
      </div>

      <div class="steps">
        <h3>How It Works</h3>
        <ol>
          <li>Visit <a href="https://ernit.app" style="color: #8B5CF6;">ernit.app</a> and create an account</li>
          <li>Enter your redemption code</li>
          <li>Set up your personalized fitness goals</li>
          <li>Share your partner's code with them so they can do the same</li>
          <li>Complete your goals together to unlock the experience!</li>
        </ol>
      </div>
    </div>

    <div class="footer">
      <p style="font-size: 16px; margin-bottom: 10px;">Ernit - Earn It Together</p>
      <p>This email was sent to ${purchaserEmail} for a Valentine's Challenge purchase</p>
      <p style="margin-top: 15px;">
        <a href="https://ernit.app" style="color: #8B5CF6; text-decoration: none;">ernit.app</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
