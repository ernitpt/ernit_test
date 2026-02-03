/**
 * Generate HTML email for Valentine's Challenge redemption codes
 */
export function generateValentineEmail(
    recipientEmail: string,
    redemptionCode: string,
    partnerEmail: string,
    isPurchaser: boolean
): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { 
      background: linear-gradient(135deg, #FF6B9D 0%, #C2185B 100%); 
      color: white; 
      padding: 40px 20px; 
      text-align: center; 
    }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px 20px; background: #fff; }
    .code-section { 
      background: linear-gradient(135deg, #F3E8FF 0%, #FFF0F6 100%); 
      padding: 30px; 
      text-align: center; 
      border-radius: 12px; 
      margin: 25px 0;
      border: 2px dashed #8B5CF6;
    }
    .code-label { 
      font-size: 14px; 
      color: #8B5CF6; 
      font-weight: bold; 
      letter-spacing: 1px; 
      margin-bottom: 10px;
    }
    .code-text { 
      font-size: 36px; 
      font-weight: bold; 
      color: #8B5CF6; 
      letter-spacing: 6px; 
      font-family: 'Courier New', monospace;
      margin: 15px 0;
    }
    .button { 
      display: inline-block; 
      background: #FF6B9D; 
      color: white !important; 
      padding: 16px 32px; 
      text-decoration: none; 
      border-radius: 8px; 
      margin: 20px 0;
      font-weight: bold;
      font-size: 16px;
    }
    .button:hover { background: #E85A8C; }
    .steps { 
      background: #F9FAFB; 
      padding: 20px; 
      border-radius: 8px; 
      margin: 20px 0; 
    }
    .steps h3 { color: #374151; margin-top: 0; }
    .steps ol { padding-left: 20px; }
    .steps li { margin: 10px 0; color: #6B7280; }
    .important-box {
      background: #FFF7ED;
      border-left: 4px solid #F59E0B;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer { 
      text-align: center; 
      color: #9CA3AF; 
      padding: 30px 20px; 
      background: #F9FAFB;
    }
    .footer p { margin: 5px 0; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💕 Your Valentine's Challenge!</h1>
      <p style="margin: 10px 0 0 0; font-size: 16px;">Get ready for an amazing journey together</p>
    </div>
    
    <div class="content">
      <p style="font-size: 16px;">Hi there! 👋</p>
      
      <p>
        ${isPurchaser
            ? `Thank you for purchasing a Valentine's Challenge!`
            : `You've been gifted a Valentine's Challenge!`
        } 
        You'll be working together with <strong>${partnerEmail}</strong> to achieve your fitness goals! 💪
      </p>
      
      <div class="code-section">
        <div class="code-label">YOUR REDEMPTION CODE</div>
        <div class="code-text">${redemptionCode}</div>
        <p style="margin: 15px 0 0 0; color: #6B7280; font-size: 14px;">
          Keep this code safe - you'll need it to get started!
        </p>
      </div>
      
      <div style="text-align: center;">
        <a href="https://ernit.app" class="button">Redeem Your Code →</a>
      </div>
      
      <div class="steps">
        <h3>📋 What's Next?</h3>
        <ol>
          <li>Visit <a href="https://ernit.app" style="color: #8B5CF6;">ernit.app</a> or download the app</li>
          <li>Click "Redeem Code" and enter: <strong>${redemptionCode}</strong></li>
          <li>Create your account or sign in</li>
          <li>Set up your personalized fitness goals</li>
          <li>Start your journey together! 🎉</li>
        </ol>
      </div>
      
      <div class="important-box">
        <strong>⚡ Important:</strong> Both you and ${partnerEmail} must complete your weekly goals for either of you to progress. Teamwork makes the dream work!
      </div>
      
      <p style="color: #6B7280;">
        Have questions? Just reply to this email and we'll be happy to help!
      </p>
    </div>
    
    <div class="footer">
      <p style="font-size: 18px; margin-bottom: 10px;">🌹 Ernit - Fitness Together 🌹</p>
      <p>This email was sent because a Valentine's Challenge was purchased for ${recipientEmail}</p>
      <p style="margin-top: 15px;">
        <a href="https://ernit.app" style="color: #8B5CF6; text-decoration: none;">ernit.app</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
