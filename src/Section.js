import MsgForm from './MsgForm';

export default class Section {
  #closingBracketElement;
  #editsectionElement;
  #elements;
  #cached$elements;

  constructor(headingElement, isLastSection) {
    let headlineElement = headingElement.querySelector('.mw-headline');
    this.#editsectionElement = headingElement.querySelector('.mw-editsection');
    if (!headlineElement || !this.#editsectionElement) {
      throw new cd.env.Exception();
    }
    this.#closingBracketElement = this.#editsectionElement && this.#editsectionElement.lastElementChild;
    if (!this.#closingBracketElement ||
      !this.#closingBracketElement.classList ||
      !this.#closingBracketElement.classList.contains('mw-editsection-bracket')
    ) {
      this.#closingBracketElement = null;
    }

    let headingText = cd.env.elementsToText(
      $.makeArray(headlineElement.childNodes),
      ['ch-helperText', 'userflags-wrapper', 'mw-headline-number']
    );

    let headingLevelMatches = headingElement.tagName.match(/^H([1-6])$/);
    let headingLevel = headingLevelMatches && Number(headingLevelMatches[1]);
    let headingLevelRegExp = new RegExp('^H[1-' + headingLevel + ']$');

    let elements = [headingElement];
    let element = headingElement.nextSibling;
    // The last element before the next heading, which can be a part of the next section of the same level,
    // or the subsection of this section.
    let lastElementInFirstSubdivision;
    let hasSubsections = false;
    while (element && (!element.tagName || !headingLevelRegExp.test(element.tagName))) {
      if (!lastElementInFirstSubdivision && element.tagName && /^H[2-6]$/.test(element.tagName)) {
        hasSubsections = true;
        for (let i = elements.length - 1; i >= 0; i--) {
          if (elements[i].tagName) {
            lastElementInFirstSubdivision = elements[i];
            break;
          }
        }
      }
      elements.push(element);
      element = element.nextSibling;
    }
    if (!lastElementInFirstSubdivision) {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (elements[i].tagName && !elements[i].classList.contains('cd-addSubsectionButtonContainer')) {
          lastElementInFirstSubdivision = elements[i];
          break;
        }
      }
    }

    if (!elements.length) {
      throw new cd.env.Exception();
    }

    if (cd.env.EVERYTHING_MUST_BE_FROZEN) {
      this.frozen = true;
    } else if (cd.parse.closedDiscussions.length) {
      for (let i = 0; i < cd.parse.closedDiscussions.length; i++) {
        if (cd.parse.closedDiscussions[i].contains(headingElement)) {
          this.frozen = true;
          break;
        }
      }
    }
    if (this.frozen === undefined) {
      this.frozen = false;
    }

    let msgsInSection = [];
    let msgsInFirstSubdivision = [];
    // The first and the last part will probably be enough for us.
    let msgParts = [];
    for (let i = 0; i < elements.length; i++) {
      element = elements[i];
      if (element.nodeType !== Node.ELEMENT_NODE) continue;

      // Find the first date and round off.
      if (element.classList.contains('cd-msgPart')) {
        msgParts.push(element);
        break;
      }
      let part = element.querySelector('.cd-msgPart');
      if (part) {
        msgParts.push(part);
        break;
      }
    }
    for (let i = elements.length - 1; i >= 0; i--) {
      element = elements[i];
      if (element.nodeType !== Node.ELEMENT_NODE) continue;

      // Find the last date and round off.
      let moreMsgParts = element.querySelectorAll('.cd-msgPart');
      if (moreMsgParts.length) {
        msgParts.push(moreMsgParts[moreMsgParts.length - 1]);
        break;
      }
      if (element.classList.contains('cd-msgPart')) {
        msgParts.push(element);
        break;
      }
    }
    if (msgParts.length) {
      let firstMsgPart = msgParts[0];
      let lastMsgPart = msgParts[msgParts.length - 1];
      let firstMsgPartId = Number(firstMsgPart.getAttribute('data-id'));
      let lastMsgPartId = Number(lastMsgPart.getAttribute('data-id'));
      let firstMsg, firstMsgAnchor;

      if (firstMsgPartId !== undefined && lastMsgPartId !== undefined &&
        cd.msgs[firstMsgPartId] && cd.msgs[lastMsgPartId]
      ) {
        // We assume that the id matches the index in the array.
        if (cd.msgs[firstMsgPartId].id === firstMsgPartId &&
          cd.msgs[lastMsgPartId].id === lastMsgPartId
        ) {
          firstMsg = cd.msgs[firstMsgPartId];
          if (firstMsg.level === 0 &&
            firstMsgPart.previousElementSibling &&
            /^H[1-6]$/.test(firstMsgPart.previousElementSibling.tagName)
          ) {
            firstMsg.isOpeningSection = true;
            firstMsgAnchor = firstMsgPart.id;
            firstMsgPart.removeAttribute('id');
            headingElement.id = firstMsgAnchor;
          }

          for (let i = firstMsgPartId; i <= lastMsgPartId; i++) {
            msgsInSection.push(cd.msgs[i]);

            if (hasSubsections && (
              cd.msgs[i].elements[0].compareDocumentPosition(lastElementInFirstSubdivision) &
                Node.DOCUMENT_POSITION_FOLLOWING ||
              cd.msgs[i].elements[0].compareDocumentPosition(lastElementInFirstSubdivision) &
                Node.DOCUMENT_POSITION_CONTAINS
            )) {
              // The message is before lastElementInFirstSubdivision.
              msgsInFirstSubdivision.push(cd.msgs[i]);
            }
          }
        } else {
          console.error('Ошибка при анализе сообщений в разделе: id сообщения не совпадает с индексом в массиве.');
        }
      } else {
        console.error('Ошибка при анализе сообщений в разделе: в разделе нет сообщений или неизвестно сообщений с таким id.');
      }
    }

    this.id = cd.parse.currentSectionId;
    this.level = headingLevel;
    this.heading = headingText;
    this.isLastSection = isLastSection;
    this.#elements = elements;
    this.$heading = $(headingElement);
    this.msgs = msgsInSection;
    this.msgsInFirstSubdivision = hasSubsections ? msgsInFirstSubdivision : msgsInSection;

    if (!this.frozen) {
      // Add "Reply" button under the subdivision of the section before the first heading.
      let replyButton = cd.env.SECTION_REPLY_BUTTON_PROTOTYPE.cloneNode(true);
      replyButton.firstChild.onclick = this.addReply.bind(this);

      let tag, createUl;
      if (lastElementInFirstSubdivision.classList.contains('cd-msgLevel')) {
        switch (lastElementInFirstSubdivision.tagName) {
          case 'UL':
            tag = 'li';
            break;
          case 'OL':
            tag = 'div';
            break;
          case 'DL':
            tag = 'dd';
            break;
          default:
            tag = 'li';
            createUl = true;
            break;
        }
      } else {
        tag = 'li';
        createUl = true;
      }

      let replyButtonContainer = document.createElement(tag);
      replyButtonContainer.className = 'cd-replyButtonContainer';
      replyButtonContainer.appendChild(replyButton);

      if (!createUl) {
        lastElementInFirstSubdivision.appendChild(replyButtonContainer);
      } else {
        let replyButtonUl = document.createElement('ul');
        replyButtonUl.className = 'cd-msgLevel cd-replyButtonContainerContainer';
        replyButtonUl.appendChild(replyButtonContainer);

        lastElementInFirstSubdivision.parentElement.insertBefore(
          replyButtonUl,
          lastElementInFirstSubdivision.nextSibling
        );
      }

      this.$replyButtonContainer = $(replyButtonContainer);

      this.showAddSubsectionButtonTimeout = undefined;
      this.hideAddSubsectionButtonTimeout = undefined;

      if (headingLevel === 2) {
        let addSubsectionButton = cd.env.SECTION_ADDSUBSECTION_BUTTON_PROTOTYPE.cloneNode(true);
        addSubsectionButton.firstChild.onclick = this.addSubsection.bind(this);

        let addSubsectionButtonContainer = document.createElement('div');
        addSubsectionButtonContainer.className = 'cd-addSubsectionButtonContainer';
        addSubsectionButtonContainer.style.display = 'none';
        addSubsectionButtonContainer.appendChild(addSubsectionButton);

        let lastElement = elements[elements.length - 1];
        lastElement.parentElement.insertBefore(addSubsectionButtonContainer, lastElement.nextSibling);

        this.$addSubsectionButtonContainer = $(addSubsectionButtonContainer);

        let deferAddSubsectionButtonHide = () => {
          if (!this.hideAddSubsectionButtonTimeout) {
            this.hideAddSubsectionButtonTimeout = setTimeout(() => {
              this.$addSubsectionButtonContainer.cdFadeOut(
                'fast',
                null,
                this.msgsInFirstSubdivision[this.msgsInFirstSubdivision.length - 1]
              );
            }, 1000);
          }
        };

        addSubsectionButton.firstChild.onmouseenter = () => {
          clearTimeout(this.hideAddSubsectionButtonTimeout);
          this.hideAddSubsectionButtonTimeout = null;
        };
        addSubsectionButton.firstChild.onmouseleave = () => {
          deferAddSubsectionButtonHide();
        };

        this.replyButtonHoverHandler = () => {
          if (this.addSubsectionForm &&
            !this.addSubsectionForm.$element.hasClass('cd-msgForm-hidden')
          ) {
            return;
          }

          clearTimeout(this.hideAddSubsectionButtonTimeout);
          this.hideAddSubsectionButtonTimeout = null;

          if (!this.showAddSubsectionButtonTimeout) {
            this.showAddSubsectionButtonTimeout = setTimeout(() => {
              this.$addSubsectionButtonContainer.cdFadeIn(
                'fast',
                this.msgsInFirstSubdivision[this.msgsInFirstSubdivision.length - 1]
              );
            }, 1000);
          }
        };

        this.replyButtonUnhoverHandler = () => {
          if (this.addSubsectionForm &&
            !this.addSubsectionForm.$element.hasClass('cd-msgForm-hidden')
          ) {
            return;
          }

          clearTimeout(this.showAddSubsectionButtonTimeout);
          this.showAddSubsectionButtonTimeout = null;

          deferAddSubsectionButtonHide();
        };
      }

      if (this.msgs[0] && this.msgs[0].isOpeningSection &&
        (this.msgs[0].author === cd.env.CURRENT_USER || cd.settings.allowEditOthersMsgs)
      ) {
        this.addMenuItem({
          label: 'править описание',
          func: this.msgs[0].edit.bind(this.msgs[0]),
          class: 'editHeading',
        });
      }

      this.addMenuItem({
        label: 'добавить подраздел',
        func: this.addSubsection.bind(this),
        class: 'addSubsectionLink'
      });

      if (headingLevel === 2) {
        this.addMenuItem({
          label: 'перенести',
          func: this.move.bind(this),
          class: 'moveSectionLink',
        });
      }

      cd.env.watchedTopicsPromise.done(() => {
        if (!cd.env.thisPageWatchedTopics.includes(this.heading)) {
          this.isWatched = false;
          this.addMenuItem({
            label: 'следить',
            func: this.watch.bind(this),
            class: 'watchSectionLink',
          });
        } else {
          this.isWatched = true;
          this.addMenuItem({
            label: 'не следить',
            func: this.unwatch.bind(this),
            class: 'unwatchSectionLink',
          });
        }

        // We put it here to make it appear always after the "watch" item.
        this.addMenuItem({
          label: '#',
          func: this.copyLink.bind(this),
          class: 'copySectionLink',
          tooltip: 'Нажмите, чтобы скопировать вики-ссылку. Нажмите с зажатым Ctrl, чтобы выбрать другой вид ссылки.',
          href: mw.util.getUrl(cd.env.CURRENT_PAGE) + '#' + this.heading,
        });
      });
    }
  }

  addReply() {
    if (!this.addReplyForm) {
      this.addReplyForm = new MsgForm('replyInSection', this);
      cd.msgForms.push(this.addReplyForm);
    }
    this.$replyButtonContainer.hide();

    let sectionWithAddSubsectionButton = this.level === 2 ? this : this.baseSection;
    if (sectionWithAddSubsectionButton && sectionWithAddSubsectionButton.$addSubsectionButtonContainer) {
      sectionWithAddSubsectionButton.$addSubsectionButtonContainer.hide();

      clearTimeout(sectionWithAddSubsectionButton.showAddSubsectionButtonTimeout);
      sectionWithAddSubsectionButton.showAddSubsectionButtonTimeout = null;
    }

    this.addReplyForm.show(cd.settings.slideEffects ? 'slideDown' : 'fadeIn');
    this.addReplyForm.textarea.focus();
  }

  addSubsection() {
    if (this.$addSubsectionButtonContainer) {
      this.$addSubsectionButtonContainer.hide();
    }
    if (!this.addSubsectionForm) {
      this.addSubsectionForm = new MsgForm('addSubsection', this);
      cd.msgForms.push(this.addSubsectionForm);
    }

    // Get the height before the animation has started, so the height it right.
    let height = this.addSubsectionForm.$element.height();
    let willBeInViewport = this.addSubsectionForm.$element.cdIsInViewport();

    if (this.addSubsectionForm.$element.css('display') === 'none') {
      this.addSubsectionForm.show(cd.settings.slideEffects ? 'slideDown' : 'fadeIn');
    }
    if (!willBeInViewport) {
      this.addSubsectionForm.$element.cdScrollTo('middle', null, null, height / 2);
    }

    this.addSubsectionForm.headingInput.focus();
  }

  move() {
    $.when(
      cd.env.loadPageCode(cd.env.CURRENT_PAGE),
      mw.loader.using('mediawiki.widgets')
    ).done(result => {
      this.locateInCode(result.code, result.queryTimestamp);
      let sectionCode = this.inCode && this.inCode.code;
      if (!sectionCode) {
        mw.notify(cd.strings.couldntLocateSectionInCode, { type: 'error', autoHide: false });
        return;
      }

      function MoveSectionDialog() {
        MoveSectionDialog.parent.call(this);
      }
      OO.inheritClass(MoveSectionDialog, OO.ui.ProcessDialog);

      MoveSectionDialog.static.name = 'moveSectionDialog';
      MoveSectionDialog.static.title = 'Перенести тему';
      MoveSectionDialog.static.actions = [
        {
          modes: 'move',
          action: 'move',
          label: 'Перенести',
          flags: ['primary', 'progressive'],
          disabled: true,
        },
        {
          modes: 'move',
          label: 'Отмена',
          flags: 'safe',
        },
        {
          modes: 'reload',
          action: 'reload',
          label: 'Обновить',
          flags: ['primary', 'progressive'],
        },
        {
          modes: 'reload',
          label: 'Закрыть',
          flags: 'safe',
        },
      ];

      MoveSectionDialog.prototype.initialize = function () {
        MoveSectionDialog.parent.prototype.initialize.apply(this, arguments);

        this.panelMove = new OO.ui.PanelLayout({ padded: true, expanded: false });
        this.fieldsetMove = new OO.ui.FieldsetLayout();

        this.titleInput = new mw.widgets.TitleInputWidget({
          $overlay: this.$overlay,
          excludeCurrentPage: true,  // Doesn't seem to work
          validate: (function () {
            let title = this.titleInput.getMWTitle();
            return title && title.toText() !== cd.env.CURRENT_PAGE &&
              cd.env.isDiscussionNamespace(title.namespace);
          }.bind(this))
        });
        this.titleField = new OO.ui.FieldLayout(
          this.titleInput,
          {
            label: 'Введите название страницы форума или обсуждения, куда вы хотите перенести тему:',
            align: 'top'
          }
        );

        this.fieldsetMove.addItems([this.titleField]);
        this.panelMove.$element.append(this.fieldsetMove.$element);

        let $sectionCodeNote = $('<div>');
        $('<pre>')
          .text(sectionCode.slice(0, 300) + (sectionCode.length >= 300 ? '...' : ''))
          .appendTo($sectionCodeNote);
        $('<p>')
          .css('font-size', '85%')
          .text('Код может быть другим, если страница будет обновлена за время простоя окна.')
          .appendTo($sectionCodeNote);

        this.panelMove.$element.append($sectionCodeNote);

        this.panelReload = new OO.ui.PanelLayout({ padded: true, expanded: false });

        this.stackLayout = new OO.ui.StackLayout({
          items: [this.panelMove, this.panelReload]
        });
        this.$body.append(this.stackLayout.$element);

        this.titleInput.connect(this, { 'change': 'onTitleInputChange' });
        this.titleInput.connect(this, { 'enter': (function () {
          if (!this.actions.get({ actions: 'move' })[0].isDisabled()) {
            this.executeAction('move');
          }
        }.bind(this)) });
      };

      MoveSectionDialog.prototype.onTitleInputChange = function (value) {
        this.titleInput.getValidity()
          .done(function () {
            this.actions.setAbilities({ move: true });
          }.bind(this))
          .fail(function () {
            this.actions.setAbilities({ move: false });
          }.bind(this));
      };

      MoveSectionDialog.prototype.getSetupProcess = function (data) {
        return MoveSectionDialog.parent.prototype.getSetupProcess.call(this, data)
          .next(function () {
            this.stackLayout.setItem(this.panelMove);
            this.actions.setMode('move');
          }, this);
      };

      let section = this;

      MoveSectionDialog.prototype.getActionProcess = function (action) {
        let sectionInSourcePageCode, sourcePageCode, sourcePageTimestamp, sourceWikilink, targetTitle,
          targetPageCode, targetWikilink, newSourcePageCode, newTargetPageCode;
        let dialog = this;

        let abort = (text, recoverable) => {
          dialog.popPending();
          dialog.showErrors(new OO.ui.Error(text, recoverable));
          dialog.actions.setAbilities({ move: recoverable });
        };

        if (action === 'move') {
          let loadSourcePageDoneCallback = result => {
            sourcePageCode = result.code;
            sourcePageTimestamp = result.queryTimestamp;
            sectionInSourcePageCode = sourcePageCode &&
              section.locateInCode(sourcePageCode, sourcePageTimestamp);
            if (!sectionInSourcePageCode) {
              abort(cd.strings.couldntLocateSectionInCode, true);
              return;
            }

            targetTitle = dialog.titleInput.getMWTitle();
            // Should be ruled out by making the button disabled.
            if (!targetTitle ||
              targetTitle.toText() === cd.env.CURRENT_PAGE ||
              !cd.env.isDiscussionNamespace(targetTitle.namespace)
            ) {
              abort('Неверно указана страница.', false);
              return;
            }

            cd.env.loadPageCode(targetTitle)
              .done(loadTargetPageDoneCallback)
              .fail(loadTargetPageFailCallback);
          };

          let loadSourcePageFailCallback = (errorType, data) => {
            let text, recoverable;
            if (errorType === 'api') {
              if (data === 'missing') {
                text = 'Текущая страница была удалена.';
                recoverable = true;
              } else {
                text = 'Ошибка API: ' + data + '.';
                recoverable = true;
              }
            } else if (errorType === 'network') {
              text = 'Сетевая ошибка.';
              recoverable = true;
            }
            abort(text, recoverable);
          };

          let loadTargetPageDoneCallback = result => {
            targetPageCode = result.code;
            if (result.redirectTarget) {
              targetTitle = result.redirectTarget;
            }

            let newTopicsOnTop;
            if (/\{\{?:[нН]овые сверху/.test(targetPageCode)) {
              newTopicsOnTop = true;
            } else if (/^(?:Форум[/ ]|Оспаривание |Запросы|.* запросы)/
              .test(targetTitle.toText())
            ) {
              newTopicsOnTop = true;
            } else if (/^К (?:удалению|объединению|переименованию|разделению|улучшению)/
              .test(targetTitle.toText())
            ) {
              newTopicsOnTop = false;
            }

            let firstSectionPos;
            // Determine the topic order: newest first or newest last
            sectionHeadingsRegExp = /^==[^=].*?==[ \t]*(?:<!--[^]*?-->[ \t]*)*\n/gm;
            let sectionHeadingsMatches;

            let codeStartingWithThisSection, date, prevTimestamp, timestamp;
            let newerHigherCount = 0, newerLowerCount = 0;
            while ((sectionHeadingsMatches = sectionHeadingsRegExp.exec(targetPageCode)) &&
              (newTopicsOnTop === undefined ||
                !firstSectionPos
              )
            ) {
              if (firstSectionPos === undefined) {
                firstSectionPos = sectionHeadingsMatches.index;
              }
              codeStartingWithThisSection = targetPageCode.slice(sectionHeadingsMatches.index);

              date = cd.env.findFirstDate(codeStartingWithThisSection);
              timestamp = date && getTimestampFromDate(date);
              if (prevTimestamp) {
                if (timestamp > prevTimestamp) {
                  newerLowerCount++;
                } else {
                  newerHigherCount++;
                }
              }
              prevTimestamp = timestamp;

              if (Math.abs(newerLowerCount - newerHigherCount) > 5) {
                newTopicsOnTop = newerHigherCount > newerLowerCount;
              }
            }

            if (newerHigherCount === newerLowerCount) {
              newTopicsOnTop = !Boolean(targetTitle.namespace % 2);
            }

            // Generate the new codes of the pages
            date = cd.env.findFirstDate(sectionInSourcePageCode.code);

            sourceWikilink = cd.env.CURRENT_PAGE + '#' + section.heading;
            targetWikilink = targetTitle.toText() + '#' + section.heading;

            let newSectionInSourcePageCode = sectionInSourcePageCode.code.slice(0,
              sectionInSourcePageCode.contentStartPos - sectionInSourcePageCode.startPos
            ) + '{{перенесено на|' + targetWikilink + '|' + cd.settings.mySig + '}}\n' +
              '<small>Для бота: ' + date + '</small>\n\n';
            let newSectionInTargetPageCode = sectionInSourcePageCode.code.slice(0,
              sectionInSourcePageCode.contentStartPos - sectionInSourcePageCode.startPos
            ) + '{{перенесено с|' + sourceWikilink + '|' + cd.settings.mySig + '}}\n' +
              sectionInSourcePageCode.code.slice(sectionInSourcePageCode.contentStartPos -
                sectionInSourcePageCode.startPos
              );

            newSourcePageCode = sourcePageCode.slice(0, sectionInSourcePageCode.startPos) +
              newSectionInSourcePageCode + sourcePageCode.slice(sectionInSourcePageCode.endPos);

            if (newTopicsOnTop) {
              // The page has no sections, so we add to the bottom.
              if (firstSectionPos === undefined) {
                firstSectionPos = targetPageCode.length;
              }
              newTargetPageCode = targetPageCode.slice(0, firstSectionPos) + newSectionInTargetPageCode +
                targetPageCode.slice(firstSectionPos);
            } else {
              newTargetPageCode = targetPageCode + '\n\n' + newSectionInTargetPageCode;
            }

            new mw.Api().postWithToken('csrf', {
              action: 'edit',
              title: targetTitle.toString(),
              // FIXME: adjust if it goes beyond the maximum length.
              summary: cd.env.formSummary('/* ' + section.heading + ' *' + '/ перенесено с [[' + sourceWikilink + ']]'),
              text: newTargetPageCode,
              //basetimestamp: result.queryTimestamp,
              starttimestamp: new Date(result.queryTimestamp).toISOString(),
              formatversion: 2,
            })
              .done(editTargetPageDoneCallback)
              .fail(editTargetPageFailCallback);
          };

          let loadTargetPageFailCallback = (errorType, data) => {
            let text, recoverable;
            if (errorType === 'api') {
              if (data === 'missing') {
                text = 'Целевая страница не существует.';
                recoverable = true;
              } else if (data === 'invalid') {  // Must be filtered before submit.
                text = 'Указано невозможное название страницы';
                recoverable = false;
              } else {
                text = 'Неизвестная ошибка API: ' + data + '.';
                recoverable = true;
              }
            } else if (errorType === 'network') {
              text = 'Сетевая ошибка.';
              recoverable = true;
            }
            abort(text, recoverable);
          };

          let editTargetPageDoneCallback = data => {
            let error = data.error;
            if (error) {
              if (error.code === 'editconflict') {
                text = 'Конфликт редактирования. Просто нажмите «' +  OO.ui.msg('ooui-dialog-process-retry') + '».';
                recoverable = true;
              } else {
                text = error.code + ': ' + error.info;
                recoverable = true;
              }
              abort(text, recoverable);
            }

            new mw.Api().postWithToken('csrf', {
              action: 'edit',
              title: cd.env.CURRENT_PAGE,
              // FIXME: adjust if it goes beyond the maximum length.
              summary: cd.env.formSummary('/* ' + section.heading + ' *' + '/ перенесено на [[' + targetWikilink + ']]'),
              text: newSourcePageCode,
              //basetimestamp: sourcePageTimestamp,
              starttimestamp: new Date(sourcePageTimestamp).toISOString(),
              formatversion: 2,
            })
              .done(editSourcePageDoneCallback)
              .fail(editSourcePageFailCallback);
          };

          let editTargetPageFailCallback = () => {
            abort('Сетевая ошибка при редактировании целевой страницы.', true);
          };

          let editSourcePageDoneCallback = () => {
            let url = mw.util.getUrl(targetWikilink);
            dialog.panelReload.$element.html('<p>Тема успешно перенесена. Вы можете обновить страницу или перейти на <a href="' + url + '">страницу, куда была перенесена тема</a>.</p>');

            dialog.popPending();
            dialog.stackLayout.setItem(dialog.panelReload);
            dialog.actions.setMode('reload');
          };

          let editSourcePageFailCallback = () => {
            abort('Сетевая ошибка при редактировании исходной страницы. Вам придётся вручную совершить правку исходной страницы или отменить правку целевой страницы.', false);
          };

          return new OO.ui.Process(function () {
            dialog.pushPending();
            dialog.titleInput.$input.blur();
            dialog.actions.setAbilities({ move: false });

            cd.env.loadPageCode(cd.env.CURRENT_PAGE)
              .done(loadSourcePageDoneCallback)
              .fail(loadSourcePageFailCallback);
          });
        } else if (action === 'reload') {
          return new OO.ui.Process(function () {
            dialog.close({ action: action });
            cd.env.reloadPage();
          });
        }
        return MoveSectionDialog.parent.prototype.getActionProcess.call(dialog, action);
      };

      MoveSectionDialog.prototype.getBodyHeight = function () {
        return this.panelMove.$element.outerHeight(true);
      };

      let moveSectionDialog = new MoveSectionDialog();

      $('body').append(cd.env.windowManager.$element);
      cd.env.windowManager.addWindows([moveSectionDialog]);

      let moveSectionWindow = cd.env.windowManager.openWindow(moveSectionDialog);
      moveSectionWindow.opened.then(() => {
        moveSectionDialog.titleInput.focus();
      });
    });
  }

  watch() {
    cd.env.thisPageWatchedTopics.push(this.heading);
    cd.env.setWatchedTopics(cd.env.watchedTopics)
      .done(() => {
        mw.notify(cd.env.toJquerySpan(
          'Иконка у сообщений в разделе «' + this.heading + '» в списке наблюдения теперь будет синей.'
        ));
      })
      .fail(e => {
        let [errorType, data] = e;
        if (errorType === 'internal' && data === 'sizelimit') {
          mw.notify('Не удалось обновить настройки: размер списка отслеживаемых тем превышает максимально допустимый. Отредактируйте список тем, чтобы это исправить.');
        } else {
          mw.notify('Не удалось обновить настройки.');
        }
      });

    let $watchSectionLink = this.$heading.find('.cd-watchSectionLink')
      .removeClass('cd-watchSectionLink')
      .addClass('cd-unwatchSectionLink')
      .off('click')
      .click(this.unwatch.bind(this))
      .text('не следить');
    $watchSectionLink[0].onclick = null;
  }

  unwatch() {
    cd.env.thisPageWatchedTopics.splice(cd.env.thisPageWatchedTopics.indexOf(this.heading), 1);
    cd.env.setWatchedTopics(cd.env.watchedTopics)
      .done(() => {
        mw.notify(cd.env.toJquerySpan(
          'Иконка у сообщений в разделе «' + this.heading + '» в списке наблюдения теперь будет серой.'
        ));
      })
      .fail(() => {
        mw.notify('Не удалось обновить настройки.');
      });

    let $unwatchSectionLink = this.$heading.find('.cd-unwatchSectionLink')
      .removeClass('cd-unwatchSectionLink')
      .addClass('cd-watchSectionLink')
      .off('click')
      .click(this.watch)
      .text('следить');
    $unwatchSectionLink[0].onclick = null;
  }

  copyLink(e) {
    let url;
    let wikilink = '[[' + cd.env.CURRENT_PAGE + '#' + this.heading + ']]';
    try {
      url = 'https:' + mw.config.get('wgServer') + decodeURI(mw.util.getUrl(cd.env.CURRENT_PAGE)) + '#' +
        this.heading.replace(/ /g, '_');
    } catch (e) {
      console.error(e.stack);
      return;
    }

    if (!e.ctrlKey) {
      let link, subject;
      switch (cd.settings.defaultCopyLinkType) {
        default:
        case 'wikilink':
          link = wikilink;
          subject = 'Вики-ссылка';
          break;
        case 'link':
          link = url;
          subject = 'Ссылка';
          break;
        case 'discord':
          link = '<' + url + '>';
          subject = 'Discord-ссылка';
          break;
      }

      let $textarea = $('<textarea>')
        .val(link)
        .appendTo($('body'))
        .select();
      let successful = document.execCommand('copy');
      $textarea.remove();

      if (successful) {
        e.preventDefault();
        mw.notify(subject + ' на раздел скопирована в буфер обмена.');
      }
    } else {
      e.preventDefault();

      let messageDialog = new OO.ui.MessageDialog();
      $('body').append(cd.env.windowManager.$element);
      cd.env.windowManager.addWindows([messageDialog]);

      let textInputWikilink = new OO.ui.TextInputWidget({
        value: wikilink,
      });
      let textFieldWikilink = new OO.ui.FieldLayout(textInputWikilink, {
        align: 'top',
        label: 'Вики-ссылка',
      });

      let textInputAnchorWikilink = new OO.ui.TextInputWidget({
        value: '[[#' + this.heading + ']]'
      });
      let textFieldAnchorWikilink = new OO.ui.FieldLayout(textInputAnchorWikilink, {
        align: 'top',
        label: 'Вики-ссылка с этой же страницы',
      });

      let textInputUrl = new OO.ui.TextInputWidget({
        value: url
      });
      let textFieldUrl = new OO.ui.FieldLayout(textInputUrl, {
        align: 'top',
        label: 'Обычная ссылка',
      });

      let textInputDiscord = new OO.ui.TextInputWidget({
        value: '<' + url + '>',
      });
      let textFieldDiscord = new OO.ui.FieldLayout(textInputDiscord, {
        align: 'top',
        label: 'Ссылка для Discord',
      });

      let copyLinkWindow = cd.env.windowManager.openWindow(messageDialog, {
        message: textFieldWikilink.$element
          .add(textFieldAnchorWikilink.$element)
          .add(textFieldUrl.$element)
          .add(textFieldDiscord.$element),
        actions: [
          { label: 'Закрыть', action: 'close' },
        ],
        size: 'large',
      });
      let closeOnCtrlC = e => {
        if (e.ctrlKey && e.keyCode === 67) {  // Ctrl+C
          setTimeout(() => {
            messageDialog.close();
          }, 100);
        }
      };
      copyLinkWindow.opened.then(() => {
        (cd.settings.defaultCopyLinkType === 'wikilink' ? textInputUrl : textInputWikilink)
          .focus()
          .select();
        $(document).keydown(closeOnCtrlC);
      });
      copyLinkWindow.closed.then(() => {
        $(document).off('keydown', closeOnCtrlC);
      });
    }
  }

  locateInCode(pageCode, timestamp) {
    if (pageCode == null) {
      console.error('В первый параметр не передан код страницы. Используйте Section.loadCode для получения местоположения раздела в коде (оно появится в свойстве Section.inCode).');
      return;
    }

    let firstMsgAuthor = this.msgs && this.msgs[0] && this.msgs[0].author;
    let firstMsgDate = this.msgs && this.msgs[0] && this.msgs[0].date;

    let sectionCode, sectionStartPos, sectionEndPos, sectionContentStartPos, sectionSubdivisionEndPos,
      sectionSubdivisionCode;
    let headingToFind = cd.env.encodeWikiMarkup(this.heading);
    let sectionFound = false;
    let sectionHeadingsRegExp = /^((=+)(.*?)\2[ \t]*(?:<!--[^]*?-->[ \t]*)*)\n/gm;

    // To ignore the comment contents (there could be section presets there) but get the right positions
    // and code at the output.
    let adjustedPageCode = pageCode.replace(/(<!--)([^]*?)(-->)/g, (s, m1, m2, m3) => {
      return m1 + ' '.repeat(m2.length) + m3;
    });

    let searchForSection = (checkHeading, checkFirstMsg) => {
      let sectionHeadingsMatches;
      while (sectionHeadingsMatches = sectionHeadingsRegExp.exec(adjustedPageCode)) {
        let thisHeading = sectionHeadingsMatches[3];
        thisHeading = thisHeading && cd.env.encodeWikiMarkup(cd.env.cleanSectionHeading(thisHeading));

        if (!checkHeading || thisHeading === headingToFind) {
          let fullMatch = sectionHeadingsMatches[1];
          let equalSigns = sectionHeadingsMatches[2];

          // Get the section content.
          let equalSignsPattern = '={1,' + equalSigns.length + '}';

          let codeFromSection = pageCode.slice(sectionHeadingsMatches.index);
          let adjustedCodeFromSection = adjustedPageCode.slice(sectionHeadingsMatches.index);
          let sectionMatches = adjustedCodeFromSection.match(
            // Will fail at "===" or the like.
            '(' +
            mw.RegExp.escape(fullMatch) +
            '[^]*?\n)' +
            equalSignsPattern +
            '[^=].*?=+[ \t]*(?:<!--[^]*?-->[ \t]*)*\n'
          ) || codeFromSection.match(
            '(' +
            mw.RegExp.escape(fullMatch) +
            '[^]*$)'
          );

          // To simplify the operation of the replyInSection mode we don't consider the terminating
          // line breaks to be a part of the section subdivision before the first heading.
          let sectionSubdivisionMatches = adjustedCodeFromSection.match(
            // Will fail at "===" or the like.
            '(' +
            mw.RegExp.escape(fullMatch) +
            '[^]*?\n)\n*' +
            '={1,6}' +  // Any next heading.
            '[^=].*?=+[ \t]*(?:<!--[^]*?-->[ \t]*)*\n'
          ) || codeFromSection.match(
            '(' +
            mw.RegExp.escape(fullMatch) +
            '[^]*$)'
          );
          let sectionCode = sectionMatches &&
            codeFromSection.substr(sectionMatches.index, sectionMatches[1].length);
          sectionSubdivisionCode = sectionSubdivisionMatches &&
            codeFromSection.substr(
              sectionSubdivisionMatches.index,
              sectionSubdivisionMatches[1].length
            );

          if (!sectionCode || !sectionSubdivisionCode) {
            console.log('Не удалось считать содержимое раздела «' + thisHeading + '».');
            continue;
          }

          if (checkFirstMsg) {
            let [firstMsgInCodeMatch] = cd.env.findFirstMsg(sectionCode);

            if (firstMsgInCodeMatch) {
              let [authorInCode, dateInCode] = cd.env.collectAuthorAndDate(firstMsgInCodeMatch);

              if (// Found date, but it's not a message.
                (!firstMsgDate && !firstMsgAuthor && !checkHeading) ||
                (dateInCode !== firstMsgDate ||
                  authorInCode !== firstMsgAuthor ||
                  // A workaround: Dibot is often posting many messages at КУ with the same
                  // date – we can't rely solely on the first message data, without checking
                  // the heading.
                  (authorInCode === 'Dibot' && !checkHeading)
                )
              ) {
                continue;
              }
            } else {
              if (this.msgs && this.msgs[0] || !checkHeading) {
                continue;
              } else {
                // There's no messages neither in the code nor on the webpage, and we checked
                // heading match, hence, this is it.
              }
            }
          }

          sectionFound = true;

          sectionStartPos = sectionHeadingsMatches.index;
          sectionEndPos = sectionStartPos + sectionCode.length;
          sectionContentStartPos = sectionHeadingsMatches.index + sectionHeadingsMatches[0].length;
          sectionSubdivisionEndPos = sectionStartPos + sectionSubdivisionCode.length;
          break;
        }
      }
    };

    searchForSection(true, true);

    // Reserve method – by first message.
    if (!sectionFound) {
      searchForSection(false, true);
    }

    /*
    // Second reserve method – by heading only.
    if (!sectionFound) {
      searchForSection(true, false);
    }
    */

    if (!sectionFound) {
      return;
    }

    sectionCode = pageCode.slice(sectionStartPos, sectionEndPos);
    this.inCode = {
      startPos: sectionStartPos,
      endPos: sectionEndPos,
      contentStartPos: sectionContentStartPos,
      code: sectionCode,
      subdivisionEndPos: sectionSubdivisionEndPos,
      subdivisionCode: sectionSubdivisionCode,
      timestamp,
    };

    return this.inCode;
  }

  loadCode() {
    return cd.env.loadPageCode(cd.env.CURRENT_PAGE)
      // This is returned to a handler with ".done", so the use of ".then" is deliberate.
      .then(
        result => {
          this.locateInCode(result.code, result.queryTimestamp);
          if (!this.inCode) {
            return $.Deferred().reject('parse', cd.strings.couldntLocateSectionInCode).promise();
          }

          return $.Deferred().resolve().promise();
        },
        (errorType, data) => {
          return $.Deferred().reject(errorType, data).promise();
        }
      );
  }

  addMenuItem(item) {
    if (this.#closingBracketElement) {
      let a = document.createElement('a');
      a.textContent = item.label;
      a.href = item.href || 'javascript:';
      a.onclick = item.func;
      a.className = 'cd-' + item.class;
      if (item.tooltip) {
        a.title = item.tooltip;
      }

      let divider = document.createElement('span');
      divider.className = 'cd-sectionMenuItemsDivider';
      divider.textContent = ' | ';
      this.#editsectionElement.insertBefore(divider, this.#closingBracketElement);
      this.#editsectionElement.insertBefore(a, this.#closingBracketElement);
    }
  }

  // Using a getter allows to save a little time on running $().
  get $elements() {
    if (this.#cached$elements === undefined) {
      this.#cached$elements = $(this.#elements);
    }
    return this.#cached$elements;
  }

  set $elements(value) {
    this.#cached$elements = value;
  }
}