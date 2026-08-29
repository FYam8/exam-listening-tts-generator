window.WASESHIBU_DEFAULT_SET = {
  "id": "original-short-dialogues-01",
  "title": "【オリジナル類題】短い会話 6問",
  "subtitle": "早稲渋の短い会話形式を意識した練習セット",
  "sourceType": "original",
  "version": 1,
  "instructions": [
    "音声は各問題1回だけ聞く本番モードを基本とします。",
    "会話の後にQuestionが読まれます。",
    "正解・スクリプト・解説は全問終了後に確認できます。"
  ],
  "questions": [
    {
      "id": "q1",
      "number": 1,
      "dialogue": [
        {
          "role": "male",
          "text": "I forgot my umbrella, and it's starting to rain."
        },
        {
          "role": "female",
          "text": "I have a spare one in my bag."
        }
      ],
      "question": "What will the man probably say next?",
      "choices": [
        "No, I don't like rain.",
        "Thanks. Can I borrow it?",
        "I bought it yesterday.",
        "The forecast was sunny."
      ],
      "correct": 1,
      "points": 2,
      "difficulty": "A",
      "tags": [
        "next-response"
      ],
      "review": {
        "reason": "女性が予備の傘を持っていると言っているので、男性は借りたいと返すのが自然です。",
        "trap": "会話に rain が出ても、天気について説明する返答を選ばないこと。",
        "expressions": [
          "a spare one",
          "Can I borrow it?"
        ]
      }
    },
    {
      "id": "q2",
      "number": 2,
      "dialogue": [
        {
          "role": "female",
          "text": "I'd like the tomato pasta, please."
        },
        {
          "role": "male",
          "text": "I'm sorry, we've sold out of that. We still have mushroom pasta and chicken rice."
        },
        {
          "role": "female",
          "text": "I had mushrooms for lunch. I'll take the chicken rice. Does it come with soup?"
        },
        {
          "role": "male",
          "text": "Yes, it does."
        },
        {
          "role": "female",
          "text": "Great. I'll have that, then."
        }
      ],
      "question": "What will the woman order?",
      "choices": [
        "tomato pasta",
        "mushroom pasta",
        "chicken rice",
        "soup only"
      ],
      "correct": 2,
      "points": 2,
      "difficulty": "A",
      "tags": [
        "final-decision",
        "information-update"
      ],
      "review": {
        "reason": "最初の tomato pasta は売り切れ。その後 mushroom pasta も選ばず、最終的に chicken rice に決めています。",
        "trap": "最初に希望した料理ではなく、最後に確定した注文を取ります。",
        "expressions": [
          "sold out",
          "I'll take ...",
          "I'll have that, then."
        ]
      }
    },
    {
      "id": "q3",
      "number": 3,
      "dialogue": [
        {
          "role": "male",
          "text": "How was your day at the sports center?"
        },
        {
          "role": "female",
          "text": "It was fun. I wanted to play tennis, but the courts were closed."
        },
        {
          "role": "male",
          "text": "So what did you do?"
        },
        {
          "role": "female",
          "text": "I went swimming, and later I visited the science center next door. We also had a picnic outside."
        }
      ],
      "question": "What did the woman not do?",
      "choices": [
        "play tennis",
        "go swimming",
        "visit the science center",
        "have a picnic"
      ],
      "correct": 0,
      "points": 2,
      "difficulty": "A",
      "tags": [
        "did-did-not",
        "information-update"
      ],
      "review": {
        "reason": "tennis は wanted to play と言っていますが、courts were closed のため実際にはしていません。",
        "trap": "やりたかったことと、実際にしたことを区別します。",
        "expressions": [
          "wanted to",
          "but",
          "were closed"
        ]
      }
    },
    {
      "id": "q4",
      "number": 4,
      "dialogue": [
        {
          "role": "female",
          "text": "The concert starts at three, but we need to meet the group twenty minutes before it begins."
        },
        {
          "role": "male",
          "text": "It takes forty minutes to get there by bus."
        },
        {
          "role": "female",
          "text": "And don't forget the ten-minute walk from your house to the bus stop."
        },
        {
          "role": "male",
          "text": "Right. I'd better leave early."
        }
      ],
      "question": "By what time should the man leave his house?",
      "choices": [
        "1:40 pm",
        "1:50 pm",
        "2:00 pm",
        "2:10 pm"
      ],
      "correct": 1,
      "points": 2,
      "difficulty": "B",
      "tags": [
        "time",
        "duration"
      ],
      "review": {
        "reason": "集合は3:00の20分前で2:40。バス40分＋徒歩10分＝50分なので、2:40−50分＝1:50です。",
        "trap": "開演時刻3:00から直接50分を引くと誤答になります。まず集合時刻を確定します。",
        "expressions": [
          "twenty minutes before",
          "It takes ...",
          "don't forget"
        ]
      }
    },
    {
      "id": "q5",
      "number": 5,
      "dialogue": [
        {
          "role": "male",
          "text": "We have Math tomorrow, History on Wednesday, and English on Friday. What should we study tonight?"
        },
        {
          "role": "female",
          "text": "English is my weakest subject, but we still have several days before that test."
        },
        {
          "role": "male",
          "text": "Then let's start with Math and study History after that. We can do English tomorrow."
        },
        {
          "role": "female",
          "text": "Sounds good."
        }
      ],
      "question": "What subjects will they study tonight?",
      "choices": [
        "Math and English",
        "Math and History",
        "History and English",
        "English only"
      ],
      "correct": 1,
      "points": 2,
      "difficulty": "A",
      "tags": [
        "final-decision",
        "plan-change"
      ],
      "review": {
        "reason": "English が苦手という情報はありますが、今夜は Math → History、English は tomorrow と最終決定しています。",
        "trap": "weakest subject という強い情報に引っ張られず、最終予定を取ります。",
        "expressions": [
          "but",
          "after that",
          "tomorrow"
        ]
      }
    },
    {
      "id": "q6",
      "number": 6,
      "dialogue": [
        {
          "role": "female",
          "text": "The movie tickets are thirty dollars each."
        },
        {
          "role": "male",
          "text": "We're both students. Is there a discount?"
        },
        {
          "role": "female",
          "text": "Yes. Students pay five dollars less for each ticket."
        },
        {
          "role": "male",
          "text": "Great. We'll take two tickets. We also want snacks for eight dollars in total."
        }
      ],
      "question": "How much will they pay altogether?",
      "choices": [
        "$50",
        "$58",
        "$63",
        "$68"
      ],
      "correct": 1,
      "points": 2,
      "difficulty": "B",
      "tags": [
        "money",
        "quantity"
      ],
      "review": {
        "reason": "学生料金は1枚25ドル。2枚で50ドル、そこにsnacks 8ドルを足して58ドルです。",
        "trap": "30×2に8を足す前に、各チケット5ドル引きを反映します。",
        "expressions": [
          "five dollars less",
          "each ticket",
          "in total",
          "altogether"
        ]
      }
    }
  ]
};
