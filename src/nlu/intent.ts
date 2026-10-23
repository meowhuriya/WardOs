export interface ParsedToolCall {
  toolName: string;
  args: Record<string, any>;
}

export interface IntentParseResult {
  matched: boolean;
  toolCalls: ParsedToolCall[];
  spokenReply: string;
}

export function parseIntentModeB(text: string, language: string = 'en'): IntentParseResult {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Helper to extract Bed number
  const bedMatch = lower.match(/\b(bed|b)\s*([0-9]+)\b/i) || lower.match(/\b([0-9]+)\s*number\s*bed\b/i);
  const bedName = bedMatch ? `Bed ${bedMatch[2] || bedMatch[1]}` : undefined;

  // 1. Morning Brief / Shift Brief
  if (
    /morning\s+brief|shift\s+brief|subah\s+ka\s+brief|briefing|daily\s+brief|start\s+of\s+shift/i.test(lower) ||
    /ఉదయం\s*బ్రీఫ్|బ్రీఫింగ్/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_morning_brief', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'यहाँ आज की सुबह की वार्ड ब्रीफिंग है।'
          : language === 'te'
          ? 'ఇది ఈ రోజు ఉదయం వార్డ్ బ్రీఫ్.'
          : "Here is today's morning ward brief.",
    };
  }

  // 2. Start rounds
  if (
    /start\s+(ward\s+)?rounds?|begin\s+(ward\s+)?rounds?|round\s+shuru|rounds?\s+shuru\s*karo|రౌండ్స్\s*ప్రారంభించండి/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'start_rounds', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'वार्ड राउंड्स शुरू किए जा रहे हैं।'
          : language === 'te'
          ? 'వార్డ్ రౌండ్స్ ప్రారంభించబడుతున్నాయి.'
          : 'Starting ward rounds from the first bed.',
    };
  }

  // 3. Next / Previous patient in rounds
  if (
    /next\s+patient|agla\s+patient|agla\s+mareez|agli\s+bed|next\s+bed|తదుపరి\s*రోగి/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_next_round_patient', args: { direction: 'next' } }],
      spokenReply:
        language === 'hi'
          ? 'अगला मरीज़ लोड हो रहा है।'
          : language === 'te'
          ? 'తదుపరి రోగి వివరాలు తీసుకుంటున్నాను.'
          : 'Moving to the next patient in rounds.',
    };
  }
  if (
    /previous\s+patient|pichla\s+patient|pichla\s+mareez|previous\s+bed|మునుపటి\s*రోగి/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_next_round_patient', args: { direction: 'prev' } }],
      spokenReply:
        language === 'hi'
          ? 'पिछला मरीज़ लोड हो रहा है।'
          : language === 'te'
          ? 'మునుపటి రోగి వివరాలు తీసుకుంటున్నాను.'
          : 'Moving to the previous patient in rounds.',
    };
  }

  // 4. Handover Draft
  if (
    /draft\s+(shift\s+)?handover|shift\s+handover\s+banao|handover\s+draft\s+karo|create\s+handover|generate\s+handover|హ్యాండోవర్\s*డ్రాఫ్ట్/i.test(lower)
  ) {
    let fromShift = 'Morning';
    let toShift = 'Evening';
    if (/night\s+to\s+morning/i.test(lower) || /night/i.test(lower)) {
      fromShift = 'Night';
      toShift = 'Morning';
    } else if (/evening\s+to\s+night/i.test(lower)) {
      fromShift = 'Evening';
      toShift = 'Night';
    }
    return {
      matched: true,
      toolCalls: [{ toolName: 'draft_handover', args: { from_shift: fromShift, to_shift: toShift } }],
      spokenReply:
        language === 'hi'
          ? `${fromShift} से ${toShift} शिफ्ट के लिए हैंडओवर ड्राफ्ट तैयार किया जा रहा है। कृपया इसे सुनकर कन्फर्म करें।`
          : language === 'te'
          ? `${fromShift} నుండి ${toShift} షిఫ్ట్ కోసం హ్యాండోవర్ డ్రాఫ్ట్ రూపొందించబడింది. దయచేసి ధృవీకరించండి.`
          : `Drafting handover for ${fromShift} to ${toShift}. Please listen to the read-back and confirm on screen to approve.`,
    };
  }

  // 5. Approve Handover
  if (
    /approve\s+handover|confirm\s+and\s+approve\s+handover|handover\s+approve\s+karo|read\s+back\s+confirmed/i.test(lower)
  ) {
    const idMatch = lower.match(/\b(ho-[0-9a-z-]+)\b/i);
    const handoverId = idMatch ? idMatch[1] : 'ho-latest';
    return {
      matched: true,
      toolCalls: [{ toolName: 'approve_handover', args: { handover_id: handoverId, confirm_read_back: true } }],
      spokenReply:
        language === 'hi'
          ? 'हैंडओवर रीड-बैक कन्फर्म हो गया है। अनुमोदन किया जा रहा है।'
          : language === 'te'
          ? 'హ్యాండోవర్ ధృవీకరించబడింది మరియు ఆమోదించబడుతోంది.'
          : 'Read-back confirmed. Shift handover approved.',
    };
  }

  // 6. Get Handover
  if (
    /show\s+(latest\s+)?handover|get\s+handover|pichla\s+handover|handover\s+dikhao/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_handover', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'नवीनतम स्वीकृत शिफ्ट हैंडओवर प्रस्तुत है।'
          : 'Retrieving the latest approved shift handover.',
    };
  }

  // 7. Draft Round Note
  if (
    /draft\s+round\s+note|round\s+note\s+(draft|likho|banao)|dictate\s+note|note\s+likho/i.test(lower)
  ) {
    const patientTarget = bedName || 'Bed 1';
    // Extract observations and plan if stated in string
    let obs = 'Patient alert and resting';
    let plan = 'Continue standard ward protocol';

    const obsMatch = clean.match(/observations?[:\s]+([^.]+(?:\.|$))/i) || clean.match(/dekha[:\s]+([^.]+(?:\.|$))/i);
    const planMatch = clean.match(/plan[:\s]+([^.]+(?:\.|$))/i) || clean.match(/karna\s+hai[:\s]+([^.]+(?:\.|$))/i);

    if (obsMatch) obs = obsMatch[1].trim();
    if (planMatch) plan = planMatch[1].trim();

    return {
      matched: true,
      toolCalls: [
        {
          toolName: 'draft_round_note',
          args: {
            patient: patientTarget,
            observations_as_stated: obs,
            plan_as_stated: plan,
          },
        },
      ],
      spokenReply:
        language === 'hi'
          ? `${patientTarget} के लिए राउंड नोट ड्राफ्ट कर दिया गया है। कृपया समीक्षा करके अप्रूव करें।`
          : `Draft round note created for ${patientTarget}. Status is DRAFT awaiting doctor approval.`,
    };
  }

  // 8. Approve Round Note
  if (
    /approve\s+(round\s+)?note|note\s+approve\s+karo/i.test(lower)
  ) {
    const noteIdMatch = lower.match(/\b(note-[0-9a-z-]+)\b/i);
    const noteId = noteIdMatch ? noteIdMatch[1] : 'note-latest';
    return {
      matched: true,
      toolCalls: [{ toolName: 'approve_round_note', args: { note_id: noteId } }],
      spokenReply:
        language === 'hi'
          ? 'राउंड नोट अनुमोदित कर दिया गया है।'
          : 'Round note approved successfully.',
    };
  }

  // 9. Add pending item (lab, imaging, consult, document)
  if (
    !/kya\s+kya\s+pending|what\s+is\s+pending|what\s+tasks?\s+are\s+pending/i.test(lower) &&
    (/add\s+pending|report\s+pending\s+hai|\breport\s+pending\b|\btest\s+pending\b|\bcbc\b.*pending|pending\s+(item|lab|test|x-?ray|ct|imaging|consult)/i.test(lower) ||
     (bedMatch && /pending\s+hai/i.test(lower)))
  ) {
    const patientTarget = bedName || 'Bed 4';
    let type: 'lab' | 'imaging' | 'consult' | 'document' = 'lab';
    if (/x-?ray|imaging|scan|ct|ultrasound/i.test(lower)) type = 'imaging';
    else if (/consult|review/i.test(lower)) type = 'consult';
    else if (/document|summary|clearance|file/i.test(lower)) type = 'document';

    // Extract description
    let desc = clean;
    if (/cbc/i.test(lower)) desc = 'Complete Blood Count (CBC) report';
    else if (/x-?ray/i.test(lower)) desc = 'Chest X-ray report';
    else if (/electrolytes/i.test(lower)) desc = 'Serum electrolytes report';
    else if (/urine/i.test(lower)) desc = 'Urine culture report';

    return {
      matched: true,
      toolCalls: [
        {
          toolName: 'add_pending_item',
          args: {
            patient: patientTarget,
            type,
            description: desc,
          },
        },
      ],
      spokenReply:
        language === 'hi'
          ? `${patientTarget} के लिए ${type.toUpperCase()} रिपोर्ट को पेंडिंग सूची में दर्ज कर लिया गया है।`
          : language === 'te'
          ? `${patientTarget} కొరకు పెండింగ్ రిపోర్ట్ నమోదు చేయబడింది.`
          : `Logged pending ${type} report for ${patientTarget}: "${desc}".`,
    };
  }

  // 10. Mark pending item received
  if (
    /report\s+(aa\s+gayi|mil\s+gayi|received|arrived)|mark\s+item\s+received|report\s+aayi\s+hai|రిపోర్ట్\s*వచ్చింది/i.test(lower)
  ) {
    const target = bedName || 'CBC';
    return {
      matched: true,
      toolCalls: [{ toolName: 'mark_item_received', args: { item_id: target } }],
      spokenReply:
        language === 'hi'
          ? `${target} की रिपोर्ट प्राप्त के रूप में दर्ज कर ली गई है।`
          : language === 'te'
          ? `${target} రిపోర్ట్ అందినట్లుగా మార్క్ చేయబడింది.`
          : `Diagnostic report for ${target} marked as received.`,
    };
  }

  // 11. Start Discharge
  if (
    /start\s+discharge|discharge\s+shuru\s*karo|discharge\s+shuru\s*karein|డిశ్చార్జ్\s*ప్రారంభించండి/i.test(lower)
  ) {
    const patientTarget = bedName || 'Bed 4';
    return {
      matched: true,
      toolCalls: [{ toolName: 'start_discharge', args: { patient: patientTarget } }],
      spokenReply:
        language === 'hi'
          ? `${patientTarget} के लिए डिस्चार्ज चेकलिस्ट शुरू कर दी गई है।`
          : language === 'te'
          ? `${patientTarget} కోసం డిశ్చార్జ్ చెక్‌లిస్ట్ ప్రారంభించబడింది.`
          : `Discharge checklist initiated for ${patientTarget}. Status set to awaiting discharge.`,
    };
  }

  // 12. Tick discharge item
  if (
    /bill\s+clear|summary\s+written|medicines?\s+handed|follow-?up\s+date|transport\s+arranged/i.test(lower)
  ) {
    const patientTarget = bedName || 'Bed 4';
    let itemKey = 'bill_cleared';
    if (/summary/i.test(lower)) itemKey = 'summary_written';
    else if (/medicine/i.test(lower)) itemKey = 'medicines_handed_over';
    else if (/follow/i.test(lower)) itemKey = 'follow_up_date_given';
    else if (/transport/i.test(lower)) itemKey = 'transport_arranged';

    return {
      matched: true,
      toolCalls: [
        {
          toolName: 'tick_discharge_item',
          args: { patient: patientTarget, item: itemKey, completed: true },
        },
      ],
      spokenReply:
        language === 'hi'
          ? `${patientTarget} के लिए डिस्चार्ज आइटम '${itemKey}' पूर्ण मार्क कर दिया गया है।`
          : `Discharge item '${itemKey}' ticked for ${patientTarget}.`,
    };
  }

  // 13. Get discharge status
  if (/discharge\s+status|who\s+is\s+getting\s+discharged|discharge\s+list/i.test(lower)) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_discharge_status', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'डिस्चार्ज प्रक्रिया में शामिल मरीज़ों की सूची प्रस्तुत है।'
          : 'Retrieving current discharge statuses across the ward.',
    };
  }

  // 14. Add task
  if (
    /add\s+task|task\s+add\s+karo|naya\s+task|karna\s+hai|టాస్క్/i.test(lower)
  ) {
    const patientTarget = bedName || 'Bed 1';
    let desc = clean;
    // Strip "add task for bed X" prefix
    desc = desc.replace(/add\s+task\s+(for\s+)?(bed\s+\d+)?/i, '').trim();
    if (!desc) desc = 'Check patient and record observations';

    return {
      matched: true,
      toolCalls: [
        {
          toolName: 'add_task',
          args: {
            patient: patientTarget,
            description: desc,
            assigned_role: 'nurse',
          },
        },
      ],
      spokenReply:
        language === 'hi'
          ? `${patientTarget} के लिए नया कार्य जोड़ा गया: "${desc}"।`
          : language === 'te'
          ? `${patientTarget} కోసం టాస్క్ జోడించబడింది.`
          : `Task added for ${patientTarget}: "${desc}".`,
    };
  }

  // 15. Complete task
  if (
    /complete\s+task|mark\s+task\s+(as\s+)?done|task\s+(pura|ho\s+gaya|complete\s+karo)|టాస్క్\s*పూర్తి/i.test(lower)
  ) {
    const query = bedName || clean.replace(/complete\s+task|mark\s+done/i, '').trim() || 'task-1';
    return {
      matched: true,
      toolCalls: [{ toolName: 'complete_task', args: { task_id: query } }],
      spokenReply:
        language === 'hi'
          ? 'कार्य को पूर्ण चिह्नित कर दिया गया है।'
          : language === 'te'
          ? 'టాస్క్ పూర్తి చేయబడింది.'
          : `Task marked as completed.`,
    };
  }

  // 16. Overdue tasks
  if (/overdue\s+tasks?|what\s+is\s+overdue|kaunse\s+task\s+late\s+hain/i.test(lower)) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_overdue_tasks', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'वार्ड में लंबित ओवरड्यू कार्यों की सूची प्रस्तुत है।'
          : 'Here are the overdue tasks requiring immediate attention.',
    };
  }

  // 17. Open tasks / what is pending
  if (
    /open\s+tasks?|pending\s+tasks?|kya\s+kya\s+pending\s+hai|kaunse\s+tasks?\s+baaki\s+hain|tasks?\s+dikhao|ఓపెన్\s*టాస్క్‌లు/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_open_tasks', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'वर्तमान में लंबित सभी वार्ड कार्यों की सूची यहाँ है।'
          : language === 'te'
          ? 'ప్రస్తుతం పెండింగ్‌లో ఉన్న టాస్క్‌ల జాబితా ఇది.'
          : 'Listing all open tasks for the ward.',
    };
  }

  // 18. Pending diagnostic items / tests
  if (
    /pending\s+(reports?|tests?|items?)|reports?\s+aane\s+baaki/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_pending_items', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'लैब और रेडियोलॉजी की लंबित रिपोर्टों की सूची यहाँ है।'
          : 'Here are the pending diagnostic items awaiting return.',
    };
  }

  // 19. Ward board / Bed occupancy
  if (
    /ward\s+board|bed\s+status|show\s+ward|ward\s+status|ward\s+me\s+kitne\s+beds?\s+hain|వార్డ్\s*బోర్డ్/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_ward_board', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'वार्ड बोर्ड की स्थिति प्रस्तुत है।'
          : language === 'te'
          ? 'వార్డ్ బోర్డ్ వివరాలు ఇక్కడ ఉన్నాయి.'
          : 'Displaying current 20-bed ward board status.',
    };
  }

  // 20. Specific patient lookup
  if (bedName || /who\s+is\s+in\s+bed|patient\s+in\s+bed|bed\s+\d+\s+ka\s+status/i.test(lower)) {
    const target = bedName || clean;
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_patient', args: { name_or_bed: target } }],
      spokenReply:
        language === 'hi'
          ? `${target} का प्रशासनिक विवरण यहाँ है।`
          : `Showing patient details for ${target}.`,
    };
  }

  // 21. Shift summary / End of shift
  if (
    /shift\s+summary|end\s+of\s+shift|shift\s+ka\s+summary|సారాంశం/i.test(lower)
  ) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_shift_summary', args: {} }],
      spokenReply:
        language === 'hi'
          ? 'यहाँ इस शिफ्ट का प्रशासनिक सारांश है।'
          : language === 'te'
          ? 'ఈ షిఫ్ట్ సారాంశం ఇక్కడ ఉంది.'
          : 'Here is the end-of-shift administrative summary.',
    };
  }

  // 22. Audit log
  if (/audit\s+log|audit\s+entries|audit\s+dikhao/i.test(lower)) {
    return {
      matched: true,
      toolCalls: [{ toolName: 'get_audit_log', args: { limit: 20 } }],
      spokenReply:
        language === 'hi'
          ? 'हालिया ऑडिट लॉग प्रविष्टियाँ प्रस्तुत हैं।'
          : 'Displaying recent audit log entries.',
    };
  }

  // Default fallback if no pattern matched
  return {
    matched: false,
    toolCalls: [],
    spokenReply:
      language === 'hi'
        ? 'माफ़ कीजिए, मुझे यह प्रशासनिक कमांड समझ नहीं आया। आप राउंड्स शुरू करने, टास्क जोड़ने, या ब्रीफिंग सुनने के लिए कह सकते हैं।'
        : language === 'te'
        ? 'క్షమించండి, నాకు అర్థం కాలేదు. మీరు టాస్క్ జోడించడం లేదా మార్నింగ్ బ్రీఫ్ కోసం అడగవచ్చు.'
        : "I didn't quite catch that administrative command. You can ask to start rounds, add a task, view the ward board, or draft a shift handover.",
  };
}
